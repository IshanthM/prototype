# RoboIterate Research Notes

This project is based on the user-supplied master plan. Public search did not return the exact YC Hardware Supply Chain RFS text, so the implementation treats the supplied plan as the project source of truth and avoids adding unsupported claims.

## Competitive Position

Do not build a broad instant-quote marketplace. Xometry, Protolabs, and Prototyping.io make that an unattractive first wedge.

Build for robotics teams first:

- They have time-sensitive parts.
- They often lack procurement support.
- They have real CAD/STL/STEP files.
- They can validate the product with founder-owned robotics examples.

## Technical Direction

- Parse STL/STEP safely and conservatively.
- Use deterministic DFM rules.
- Recommend process and supplier fit without claiming certainty.
- Track versions and iteration time because that is the proof point.

