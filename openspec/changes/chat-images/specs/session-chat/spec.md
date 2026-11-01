## ADDED Requirements

### Requirement: Draw a deliverable in place of its directive
A `MEDIA:<path>` directive in Hermes's reply, or in the person's own message, SHALL be drawn as the file it names and never as its text. An image SHALL show in place of the directive. Every other deliverable SHALL show as a small chip with an icon for its kind (image, video, audio, file) and the file name. A directive that ends its line SHALL be drawn there, between the lines around it. A directive in the middle of a line (in a sentence or a table cell) SHALL leave the file name in the line, so the line stays whole, and the file SHALL be drawn after the paragraph that holds it. The punctuation that ends the sentence SHALL stay in the text.

#### Scenario: A delivered image
- **WHEN** Hermes ends a reply with "Here is the chart:" and a `MEDIA:` directive for a PNG
- **THEN** the reply shows the text, the picture between them in place of the directive, and no `MEDIA:` text

#### Scenario: A report instead of an image
- **WHEN** Hermes delivers `/opt/data/reports/my report.pdf`
- **THEN** the reply shows a chip with a file icon and "my report.pdf"

#### Scenario: A sound and a video
- **WHEN** Hermes delivers an MP3 and an MP4
- **THEN** each shows as a chip with the icon for its kind and its file name

#### Scenario: A directive inside a sentence
- **WHEN** Hermes writes "Open MEDIA:/tmp/a.pdf for the details."
- **THEN** the reply shows "Open a.pdf for the details." on one line, with the period kept, and the chip after it

#### Scenario: A directive in a table
- **WHEN** a table cell holds a `MEDIA:` directive for a PNG
- **THEN** the cell shows the file name, the table stays whole, and the picture shows after the table

#### Scenario: A directive between list items
- **WHEN** a list item's line ends with a `MEDIA:` directive
- **THEN** the picture shows between that item and the next one

#### Scenario: A reply with no deliverable
- **WHEN** a reply holds no directive
- **THEN** the bubble is drawn exactly as before

### Requirement: Read the file from the Gateway
For a path on the Gateway the app SHALL read the bytes with `GET /api/fs/read-data-url`. While that runs the frame SHALL show a spinner. When the Gateway has no such file, refuses the path, or can't be reached, the app SHALL show a chip with the file name and an alert icon instead of the picture. A picture that failed SHALL be read again when the connection to the Gateway comes back. A `data:` or `http(s)` value SHALL be used as it is, with no read. When the phone can't draw a picture it has, it SHALL show the chip with the alert icon, except that an `http(s)` picture SHALL first be asked of the Gateway's `GET /api/media/proxy`. The app SHALL keep its last reads keyed by path, up to a count and a total size, so a list that redraws or a Session reopened does not ask for the same file again. Reads from one Gateway SHALL NOT be used for another.

#### Scenario: The bytes have not arrived yet
- **WHEN** the app has asked for a picture and the gateway hasn't answered
- **THEN** the frame holds its space with a spinner, and the picture replaces it when the answer arrives

#### Scenario: The file is not there
- **WHEN** the gateway answers 404 for the path
- **THEN** the reply shows a chip with the file name and an alert icon, and no picture

#### Scenario: The gateway can't be reached
- **WHEN** Tailscale is off and the reply holds a picture directive
- **THEN** the reply shows the chip, not an endless spinner
- **AND** once the connection comes back, the picture shows in place of the chip

#### Scenario: A picture the phone can't draw
- **WHEN** the bytes arrive but the phone can't decode them
- **THEN** the reply shows the chip with the alert icon, not an empty frame

#### Scenario: A web picture the phone can't reach
- **WHEN** Hermes writes an `https` image URL that the phone can't load
- **THEN** the app asks the Gateway's image proxy for it and shows the picture it sends back
- **AND** when the proxy refuses or fails too, the reply shows the chip

#### Scenario: A directive that carries the bytes itself
- **WHEN** Hermes writes a `data:image/png;base64,` value
- **THEN** the picture shows with no call to the gateway

### Requirement: Expand a delivered image
Tapping a delivered image SHALL switch it between a fixed frame and full width, and tapping it again SHALL switch it back.

#### Scenario: Look closer
- **WHEN** the person taps a delivered image
- **THEN** the image fills the width of the transcript, and tapping it again returns it to the frame

### Requirement: A directive the app can't read yet stays text
A `MEDIA:` value the app can't read as a complete path SHALL stay as text: a path still arriving while the reply streams, a value that doesn't end with a known delivery extension, a quote left open, or a directive inside a code span or a fenced code block. While a reply streams, an unquoted path at the very end of the text SHALL stay text, because it may still grow (`report.doc` into `report.docx`).

#### Scenario: A path cut short mid-stream
- **WHEN** the reply so far ends with "MEDIA:/opt/data/image_cache/char"
- **THEN** the reply shows that text, with no chip or half-loaded frame
- **AND** once "t.png" and the next line arrive, or the reply ends, the same reply shows the picture

#### Scenario: A path that is longer than it first looks
- **WHEN** the reply so far ends with "MEDIA:/tmp/report.doc"
- **THEN** the reply shows that text, and no chip for "report.doc" appears before "report.docx" does

#### Scenario: A directive in a code example
- **WHEN** Hermes explains the format and shows `MEDIA:/tmp/a.png` in a fenced code block
- **THEN** the code block shows it as written, and nothing is fetched

### Requirement: Keep the directive in storage
The Session screen's items and the transcript saved on the phone SHALL keep the message text exactly as the gateway wrote it, directive included. Reading the directives SHALL happen only when a message is drawn.

#### Scenario: A saved transcript reopened
- **WHEN** the person opens a Session they opened before, whose transcript holds a directive
- **THEN** the message text is the same as the gateway's, and the deliverable is drawn again, read from the gateway

#### Scenario: A message the person sent
- **WHEN** the person sends text that contains a directive
- **THEN** it is stored and sent as they wrote it
