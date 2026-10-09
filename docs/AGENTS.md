# Writing Docs

- Write each doc for the question its reader brings:
  - architecture.md, concepts/, and bass-pitch/ are explanations. They answer how the application and its algorithms work, such as what each part is responsible for, how data and control flow between parts, and why a technique solves its problem, so a reader can follow them without the code open. They do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
  - references.md is a reference. It answers which outside projects are useful for what.
  - e2e.md and rust-development.md are guides. They answer what to do, including what to run when a command rejects something.
- Use Title Case for headings. In explanations, phrase each section heading as the action the section explains, such as “Find Repetition by Shifting the Waveform”, and keep plain labels for lists such as “References”.
- Write naturally for a first-time reader, without the awkward or defensive tone that builds up when a doc is revised alongside code changes.
