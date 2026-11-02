import type { FlashListRef } from '@shopify/flash-list'
import { type RefObject, useMemo, useRef } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

/** How close to the end counts as being at the bottom. */
const AT_BOTTOM_PX = 48

/**
 * Keeps a chat list at its newest content while that content grows, until
 * the person scrolls. Touching the list stops it at once, so a streaming
 * reply can't pull the list back down under their finger. Scrolling back to
 * the bottom starts it again.
 *
 * FlashList's own autoscrollToBottomThreshold isn't used: it decides from the
 * last scroll position, so it keeps jumping to the end while the person drags.
 */
export function useFollowBottom<T>(list: RefObject<FlashListRef<T> | null>) {
  const following = useRef(true)
  const touching = useRef(false)

  return useMemo(() => {
    const check = ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
      following.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - AT_BOTTOM_PX
    }

    return {
      /** Follow again, such as after the person sends a message. */
      follow: () => {
        following.current = true
        list.current?.scrollToEnd({ animated: true })
      },
      listProps: {
        onContentSizeChange: () => {
          if (following.current) {
            list.current?.scrollToEnd({ animated: false })
          }
        },
        onMomentumScrollBegin: () => {
          touching.current = true
        },
        onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          touching.current = false
          check(event)
        },
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          // Only the person's own scrolling changes whether the list follows.
          if (touching.current) {
            check(event)
          }
        },
        onScrollBeginDrag: () => {
          touching.current = true
          following.current = false
        },
        onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          // A fling keeps moving, and onMomentumScrollEnd decides once it stops.
          if (!event.nativeEvent.velocity?.y) {
            touching.current = false
            check(event)
          }
        }
      }
    }
  }, [list])
}
