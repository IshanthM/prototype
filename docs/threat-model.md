# RoboIterate Threat Model

## Assets

- Uploaded STL/STEP robot part files
- Extracted geometry metadata
- DFM findings
- Supplier directory contacts
- Quote request text
- Waitlist emails

## Controls

- Allow only `.stl`, `.step`, and `.stp` uploads.
- Enforce upload size limit.
- Store files under generated names.
- Keep original filename as metadata only.
- Compute SHA-256 for every uploaded part.
- Never execute uploaded content.
- Avoid direct public upload paths.
- Treat all extracted file text as untrusted.
- Keep quote requests advisory and user-reviewed.

## Residual MVP Risks

- Local storage is not production auth/storage.
- File parsing is intentionally limited.
- Supplier data is manually entered and unverified.
- Estimates are rough and should not be sold as firm quotes.

