# RoboIterate YC Hardware Supply Chain Master Plan

Date captured: 2026-07-07

## Product Thesis

RoboIterate is an iteration copilot for robotics teams. It helps FTC/FRC teams, university robotics clubs, and early robot startups move from CAD file to fabricated part faster by checking design files, surfacing common manufacturability problems, recommending a process, generating a local quote request, and tracking iteration speed.

The project intentionally avoids competing head-on with Xometry, Protolabs, or Prototyping.io. The wedge is a narrow community the founder understands from hands-on robotics experience: teams with real hardware deadlines and weak procurement support.

## Target Users

- FTC/FRC robotics teams
- University robotics clubs
- Early-stage robot/hardware startups
- Mentors or students managing custom robot parts

## Core User Flow

1. Upload an STL or STEP file for a robot part.
2. The app extracts basic shape facts and revision metadata.
3. The app runs deterministic DFM checks for common robotics fabrication problems.
4. The app recommends FDM printing, CNC machining, or laser-cut sheet.
5. The user selects a local supplier/makerspace/fab lab.
6. The app generates a ready-to-send quote request.
7. The app records each uploaded version and shows iteration-speed metrics.

## MVP Scope

Included:

- Upload one STL or STEP file.
- Store uploads and revisions.
- Extract file size, format, bounding box when possible, triangle count for ASCII STL, STEP header hints, and simple feature signals.
- Run deterministic DFM rules.
- Recommend FDM, CNC, or laser cutting with rough estimate bands.
- Maintain a manually entered local supplier directory.
- Generate a quote request message.
- Show iteration timeline and average iteration time.
- Provide a public landing page and waitlist form.

Excluded:

- Instant binding price quotes.
- Supplier marketplace or payments.
- Automatic toolpath generation.
- Full CAD repair.
- Safety-critical manufacturing certification.
- Complete B-rep feature recognition.
- Production multi-tenant auth.

## Seven-Day Build Plan

### Day 1: File Upload and Shape Understanding

Build upload for STL/STEP, file hashing, revision storage, and basic geometry/metadata extraction.

### Day 2: DFM Rules and Process Suggestions

Build robotics-focused DFM checks and process recommendations for FDM, CNC, and laser-cut sheet.

### Day 3: Local Manufacturers and Quote Requests

Build supplier directory and ready-to-send RFQ message generation.

### Day 4: Iteration Dashboard

Build project timeline, version history, caught/fixed issue counts, and average time per iteration.

### Day 5: Real Parts Through the System

Run real robot parts through the workflow and record whether any supplier step is real or estimated.

### Day 6: Landing Page and Demo Video Support

Build a public page with the product story, screenshot, and waitlist form.

### Day 7: YC Application Evidence

Use real usage metrics, founder-market fit, and demo evidence in the YC application.

