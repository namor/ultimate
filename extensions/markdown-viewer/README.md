# Markdown viewer

Read local Markdown with text-based Mermaid diagrams without uploading the file.

Click a Markdown chat link to an absolute `file:///…/report.md` URL, then choose the file in the browser picker. Relative paths and file URLs with a host are not supported. The link only supplies a filename hint. You can also use **Open Markdown file…** in the command palette. The viewer accepts `.md` files up to 512 KB.

The viewer treats links and HTML as non-interactive and does not load images. It draws supported Mermaid diagrams as text. Use **Show source** to inspect a rendered diagram. If the viewer cannot draw a diagram, it shows the source directly. Use **Expand Markdown viewer** to fill the app window and **Restore Markdown viewer** to return to the smaller view. Scroll inside the document. Wide diagrams and code scroll sideways.

Closing the viewer discards the document. The browser remembers the viewer size and reading position for up to 32 file versions, using a salted identifier instead of saving names, paths, or text. Choose the file again to resume. This does not grant the viewer future access to the file.
