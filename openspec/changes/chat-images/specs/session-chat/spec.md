## ADDED Requirements

### Requirement: Draw a deliverable in place of its directive
A `MEDIA:<path>` directive in Hermes's reply, or in the person's own message, SHALL be drawn as the file it names and never as its text. An image SHALL show in place of the directive. Every other deliverable SHALL show as a small chip with an icon for its kind (image, video, audio, file) and the file name. The words around a directive SHALL stay where they were, including the punctuation that ends the sentence.

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
- **THEN** the reply shows "Open ", the deliverable, " for the details." with the period kept

#### Scenario: A reply with no deliverable
- **WHEN** a reply holds no directive
- **THEN** the bubble is drawn exactly as before

### Requirement: Read the file from the Gateway
For a path on the Gateway the app SHALL read the bytes with `GET /api/fs/read-data-url`. While that runs the frame SHALL show a spinner. When the Gateway has no such file, refuses the path, or can't be reached, the app SHALL show a chip with the file name and an alert icon instead of the picture. A `data:` or `http(s)` value SHALL be used as it is, with no read. The app SHALL keep its last reads keyed by path, so a list that redraws or a Session reopened does not ask for the same file again.

#### Scenario: The bytes have not arrived yet
- **WHEN** the app has asked for a picture and the gateway hasn't answered
- **THEN** the frame holds its space with a spinner, and the picture replaces it when the answer arrives

#### Scenario: The file is not there
- **WHEN** the gateway answers 404 for the path
- **THEN** the reply shows a chip with the file name and an alert icon, and no picture

#### Scenario: The gateway can't be reached
- **WHEN** Tailscale is off and the reply holds a picture directive
- **THEN** the reply shows the chip, not an endless spinner

#### Scenario: A directive that carries the bytes itself
- **WHEN** Hermes writes a `data:image/png;base64,` value
- **THEN** the picture shows with no call to the gateway

### Requirement: Expand a delivered image
Tapping a delivered image SHALL switch it between a fixed frame and full width, and tapping it again SHALL switch it back.

#### Scenario: Look closer
- **WHEN** the person taps a delivered image
- **THEN** the image fills the width of the transcript, and tapping it again returns it to the frame

### Requirement: A directive the app can't read yet stays text
A `MEDIA:` value the app can't read as a complete path SHALL stay as text: a path still arriving while the reply streams, a value that doesn't end with a known delivery extension, a quote left open, or a directive inside a code span or a fenced code block.

#### Scenario: A path cut short mid-stream
- **WHEN** the reply so far ends with "MEDIA:/opt/data/image_cache/char"
- **THEN** the reply shows that text, with no chip or half-loaded frame
- **AND** once "t.png" arrives, the same reply shows the picture

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
