import sys
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_presentation(output_path):
    prs = Presentation()
    # 16:9 widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6] # Blank layout

    # Colors
    NAVY = RGBColor(15, 27, 45)       # #0F1B2D
    NAVY_LIGHT = RGBColor(23, 41, 63) # #17293F
    TEAL = RGBColor(14, 124, 107)     # #0E7C6B
    TEAL_BG = RGBColor(230, 244, 241) # #E6F4F1
    BLUE = RGBColor(37, 99, 235)      # #2563EB
    AMBER = RGBColor(217, 119, 6)     # #D97706
    WHITE = RGBColor(255, 255, 255)
    CARD_BG = RGBColor(248, 250, 252) # #F8FAFC
    CARD_BORDER = RGBColor(228, 231, 236)
    TEXT_DARK = RGBColor(16, 24, 40)
    TEXT_MUTED = RGBColor(102, 112, 133)
    TEXT_LIGHT = RGBColor(241, 245, 249)

    def add_header(slide, title, category="EDUSYNC · TECHNICAL PRESENTATION", dark=False):
        # Category pill/subtitle
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
        tf_c = cat_box.text_frame
        tf_c.word_wrap = True
        tf_c.margin_left = tf_c.margin_right = tf_c.margin_top = tf_c.margin_bottom = 0
        p_c = tf_c.paragraphs[0]
        p_c.text = category.upper()
        p_c.font.size = Pt(10.5)
        p_c.font.bold = True
        p_c.font.color.rgb = TEAL if dark else TEAL

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.7), Inches(0.8))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        tf_t.margin_left = tf_t.margin_right = tf_t.margin_top = tf_t.margin_bottom = 0
        p_t = tf_t.paragraphs[0]
        p_t.text = title
        p_t.font.size = Pt(24)
        p_t.font.bold = True
        p_t.font.color.rgb = WHITE if dark else NAVY

    def create_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1.2)
        return shape

    # =========================================================================
    # SLIDE 1: Title Slide (Dark Theme)
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = NAVY
    bg1.line.fill.background()

    # Pill
    pill = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(1.2), Inches(3.2), Inches(0.45))
    pill.fill.solid()
    pill.fill.fore_color.rgb = TEAL
    pill.line.fill.background()
    p_tf = pill.text_frame
    p_tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = p_tf.paragraphs[0]
    p.text = "OFFLINE-FIRST LEARNING PLATFORM"
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER

    # Main Title & Subtitle
    t_box = s1.shapes.add_textbox(Inches(1.0), Inches(1.85), Inches(11.3), Inches(2.2))
    tf = t_box.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "EduSync"
    p1.font.size = Pt(54)
    p1.font.bold = True
    p1.font.color.rgb = WHITE

    p2 = tf.add_paragraph()
    p2.text = "Bulletproof Learning Infrastructure for Intermittent Connectivity"
    p2.font.size = Pt(22)
    p2.font.color.rgb = RGBColor(143, 209, 198) # Light Teal
    p2.space_before = Pt(8)

    # Core Value Prop Box
    prop_box = create_card(s1, Inches(1.0), Inches(4.3), Inches(11.333), Inches(1.4), bg_color=NAVY_LIGHT, border_color=TEAL)
    prop_tf = prop_box.text_frame
    prop_tf.word_wrap = True
    prop_p = prop_tf.paragraphs[0]
    prop_p.text = "Architectural Paradigm: \"The device is the source of truth, the network is an optimization.\""
    prop_p.font.size = Pt(16)
    prop_p.font.bold = True
    prop_p.font.color.rgb = WHITE
    
    prop_p2 = prop_tf.add_paragraph()
    prop_p2.text = "Zero data loss under abrupt network drops, local HLC-ordered op-logs, exactly-once submission receipts, and CRDT collaborative co-editing."
    prop_p2.font.size = Pt(13)
    prop_p2.font.color.rgb = TEXT_LIGHT
    prop_p2.space_before = Pt(6)

    # Footer metrics / links
    f_box = s1.shapes.add_textbox(Inches(1.0), Inches(6.1), Inches(11.333), Inches(0.8))
    f_tf = f_box.text_frame
    f_p = f_tf.paragraphs[0]
    f_p.text = "⚡ 108/108 Automated Tests Passing   |   🌐 Cloudflare Edge Deployed   |   ♿ WCAG 2.2 AA Verified"
    f_p.font.size = Pt(13)
    f_p.font.color.rgb = RGBColor(148, 163, 184)

    # =========================================================================
    # SLIDE 2: The Real-World Problem & Flaws in Traditional EdTech
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_header(s2, "The Problem: Why Traditional LMS Fails in the Real World")

    # 3 Column Cards
    col_w = Inches(3.64)
    gap = Inches(0.39)
    top_pos = Inches(1.7)
    card_h = Inches(4.8)

    # Card 1: The Network Reality
    c1 = create_card(s2, Inches(0.8), top_pos, col_w, card_h)
    tf1 = c1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = "1. Connectivity Is Intermittent"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = NAVY

    bullets1 = [
        "In rural and developing regions, internet drops unexpectedly during commutes, weather events, or brownouts.",
        "Traditional web apps assume an always-on connection: requests block, timers expire, and students are locked out.",
        "navigator.onLine is a notorious liar: it reports 'online' even behind captive portals or dead Wi-Fi routers."
    ]
    for b in bullets1:
        bp = tf1.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(12.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(10)

    # Card 2: Devastating Failure Modes
    c2 = create_card(s2, Inches(0.8) + col_w + gap, top_pos, col_w, card_h)
    tf2 = c2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = "2. Severe Data Loss Failures"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = AMBER

    bullets2 = [
        "Lost Submissions: A student writes a 500-word exam, hits Submit during a signal dip, and the page refreshes to blank.",
        "Duplicate Submissions: Panicked students spam the submit button, spawning duplicate records or hitting rate limits.",
        "Silent Overwrites: If two students or tabs edit together, standard 'last-write-wins' clobbers work with zero warning."
    ]
    for b in bullets2:
        bp = tf2.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(12.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(10)

    # Card 3: The False Optimism Trap
    c3 = create_card(s2, Inches(0.8) + (col_w + gap)*2, top_pos, col_w, card_h)
    tf3 = c3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    p.text = "3. The 'False Optimism' Trap"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = RGBColor(180, 35, 24)

    bullets3 = [
        "Infinite Spinners: Interfaces freeze while waiting for synchronous HTTP timeouts, rendering the device useless.",
        "Session Expiry: Auth tokens expire offline; when network returns, unsaved state is trashed by login redirects.",
        "Broken Learning Continuity: Education halts when connectivity flickers, widening the socio-economic digital divide."
    ]
    for b in bullets3:
        bp = tf3.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(12.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(10)

    # =========================================================================
    # SLIDE 3: The Tech Stack (Direct, Clean, Justified)
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_header(s3, "The Tech Stack: Purpose-Built for Zero Data Loss")

    # 4 Category Cards
    w4 = Inches(2.78)
    gap4 = Inches(0.25)
    top3 = Inches(1.65)
    h3 = Inches(5.0)

    stack_cats = [
        {
            "title": "Client & UI",
            "tech": "React 18 · TypeScript · Vite",
            "color": BLUE,
            "items": [
                ("TypeScript (Strict)", "Guarantees protocol consistency across client & server."),
                ("React 18 (Hooks)", "Optimistic local state, zero UI freezes, zero blocking spinners."),
                ("Vite Build Engine", "Pre-bundles ESM assets for rapid cold starts and caching."),
                ("WCAG 2.2 AA Compliance", "Full screen-reader live regions, accessible forms, keyboard nav.")
            ]
        },
        {
            "title": "Local Storage & Offline",
            "tech": "IndexedDB · Service Worker · Yjs",
            "color": TEAL,
            "items": [
                ("IndexedDB (IDB)", "Transactional, structured local persistence surviving browser restarts."),
                ("Service Worker", "Cache-First shell strategy; serves lessons with 0ms network latency."),
                ("Append-Only Op-Log", "Every keystroke saved immediately as an immutable HLC operation."),
                ("Yjs CRDTs", "Commutative state-based CRDT for concurrent multi-student co-editing.")
            ]
        },
        {
            "title": "Server & Edge Backend",
            "tech": "Fastify · SQLite / D1 · WebSockets",
            "color": NAVY,
            "items": [
                ("Fastify REST & WS", "High-throughput, low-latency Node.js API with native schema validation."),
                ("Cloudflare Workers & D1", "Global edge execution with serverless ACID relational storage."),
                ("HTTP/2 & WebSocket Feed", "Real-time bidirectional sync + SSE fallback for patchy networks."),
                ("Idempotency Engine", "Unique indices on client ULID absorb duplicate retries safely.")
            ]
        },
        {
            "title": "Verification & Tooling",
            "tech": "Vitest · Playwright · axe-core",
            "color": AMBER,
            "items": [
                ("Vitest Suite (108 Tests)", "Unit & integration tests across protocol, server, and web."),
                ("Playwright E2E", "Automated browser offline emulation, kill-test, and sync validation."),
                ("axe-core Auditing", "Automated accessibility scans ensuring 0 color contrast or ARIA flaws."),
                ("FFmpeg Pipeline", "Automated headless video capture with custom animated cursor & HUD.")
            ]
        }
    ]

    for i, sc in enumerate(stack_cats):
        card = create_card(s3, Inches(0.8) + (w4 + gap4)*i, top3, w4, h3)
        tf = card.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = sc["title"]
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = sc["color"]

        sub = tf.add_paragraph()
        sub.text = sc["tech"]
        sub.font.size = Pt(11)
        sub.font.bold = True
        sub.font.color.rgb = TEXT_DARK
        sub.space_before = Pt(4)

        for name, desc in sc["items"]:
            item_p = tf.add_paragraph()
            item_p.text = f"• {name}: "
            item_p.font.bold = True
            item_p.font.size = Pt(11.5)
            item_p.font.color.rgb = NAVY
            item_p.space_before = Pt(8)
            
            # add desc run
            run = item_p.add_run()
            run.text = desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 4: Architecture & The Synchronization Pipeline
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_header(s4, "System Architecture: End-to-End Local-First Pipeline")

    # Top diagram / pipeline card
    pipe_card = create_card(s4, Inches(0.8), Inches(1.6), Inches(11.733), Inches(1.3), bg_color=NAVY, border_color=TEAL)
    p_tf = pipe_card.text_frame
    p_tf.word_wrap = True
    p = p_tf.paragraphs[0]
    p.text = "DATA SYNCHRONIZATION PIPELINE"
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = TEAL

    p2 = p_tf.add_paragraph()
    p2.text = "[1. User Action]  ➔  [2. Local IndexedDB Op-Log]  ➔  [3. Active State Machine]  ➔  [4. Jittered Delta Sync]  ➔  [5. Server Reconcile]"
    p2.font.size = Pt(14)
    p2.font.bold = True
    p2.font.color.rgb = WHITE
    p2.space_before = Pt(4)

    p3 = p_tf.add_paragraph()
    p3.text = "Instant 0ms UI update  |  Client-side ULID & HLC Clock  |  OFFLINE / CONNECTING / SYNCED  |  Exponential backoff + jitter  |  Atomic DB merge + 409 handling"
    p3.font.size = Pt(11)
    p3.font.color.rgb = RGBColor(148, 163, 184)
    p3.space_before = Pt(4)

    # 3 Deep Dive Boxes below
    w3 = Inches(3.72)
    gap3 = Inches(0.28)
    top_arch = Inches(3.15)
    h_arch = Inches(3.7)

    a1 = create_card(s4, Inches(0.8), top_arch, w3, h_arch)
    tf = a1.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Client: Local Durability"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = NAVY
    points_a1 = [
        "Zero-Blocking UI: Local writes commit to IndexedDB before any network socket is touched.",
        "Hybrid Logical Clocks (HLC): Merges physical wall clocks with logical counters for strict causal ordering without clock skew.",
        "Active State Machine: Truthfully exposes 'OFFLINE', 'CONNECTING', 'SYNCING', 'SYNCED', or 'DEGRADED' to the user."
    ]
    for pt in points_a1:
        bp = tf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(12)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(8)

    a2 = create_card(s4, Inches(0.8) + w3 + gap3, top_arch, w3, h_arch)
    tf = a2.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Transport: Resilient Drain"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = TEAL
    points_a2 = [
        "FIFO Queue Drain: Operations flush in sequential order as soon as network ping succeeds.",
        "Full Jittered Backoff: Prevents 'thundering herd' spikes when an entire classroom reconnects at once.",
        "Change Feed Cursors: Client and server exchange incremental delta cursors; never re-downloads entire tables."
    ]
    for pt in points_a2:
        bp = tf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(12)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(8)

    a3 = create_card(s4, Inches(0.8) + (w3 + gap3)*2, top_arch, w3, h_arch)
    tf = a3.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Server: Authoritative Sync"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = BLUE
    points_a3 = [
        "ACID Relational Storage: Backed by SQLite (Fastify) and Cloudflare D1 edge database.",
        "Idempotency Invariant: Duplicate network requests bearing the same ULID/token return the original receipt.",
        "Version Stamping: Server validates base document versions; rejects conflicting stale writes with HTTP 409."
    ]
    for pt in points_a3:
        bp = tf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(12)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(8)

    # =========================================================================
    # SLIDE 5: Solving the "Very Hard" Technical Challenges
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_header(s5, "Solving the 'Very Hard' Engineering Challenges")

    # 4 Quadrants
    quad_w = Inches(5.72)
    quad_h = Inches(2.4)
    x1 = Inches(0.8)
    x2 = Inches(6.81)
    y1 = Inches(1.65)
    y2 = Inches(4.35)

    challenges = [
        (x1, y1, "1. Exactly-Once Submission Under Drops", [
            "Problem: Network cuts mid-flight during exam submit; student retries repeatedly.",
            "Solution: Client generates canonical submissionId (ULID). Database enforces unique constraint on (assignmentId, userId, submissionId).",
            "Result: Retries are absorbed safely; client gets instant confirmed receipt."
        ], BLUE),
        (x2, y1, "2. The 'Kill Test' (Total Crash Durability)", [
            "Problem: Low-end mobile devices run out of battery or kill background browser tabs.",
            "Solution: Every action is written synchronously to IndexedDB before updating memory state.",
            "Result: 100% crash recovery. Reloading or rebooting device preserves all queued ops and drafts."
        ], RGBColor(180, 35, 24)),
        (x3 := x1, y2, "3. Clock Skew & Causality (HLC)", [
            "Problem: Device clocks can be manipulated, out of sync, or drift by hours.",
            "Solution: Hybrid Logical Clocks (HLC) combine physical millis with a monotonically increasing logical counter.",
            "Result: Guarantees strict causal order across distributed devices regardless of clock skew."
        ], TEAL),
        (x4 := x2, y2, "4. Resilient Exponential Backoff & Jitter", [
            "Problem: Instant reconnect retries overwhelm servers when an entire school network recovers.",
            "Solution: Full-jitter exponential backoff: sleep = min(max_backoff, base * 2^attempt) * random(0.5, 1.5).",
            "Result: Smooth server load distribution; graceful degradation during spotty Wi-Fi."
        ], AMBER)
    ]

    for cx, cy, ctitle, cbullets, ccolor in challenges:
        card = create_card(s5, cx, cy, quad_w, quad_h)
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = ctitle
        p.font.size = Pt(14.5)
        p.font.bold = True
        p.font.color.rgb = ccolor

        for b in cbullets:
            bp = tf.add_paragraph()
            bp.text = "• " + b
            bp.font.size = Pt(11.5)
            bp.font.color.rgb = TEXT_DARK if b.startswith("Solution") else TEXT_MUTED
            bp.font.bold = True if b.startswith("Result") else False
            bp.space_before = Pt(4)

    # =========================================================================
    # SLIDE 6: Conflict Resolution & The Collaborative CRDT Twist
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_header(s6, "Conflict Resolution & The CRDT Collaborative Twist")

    col_w6 = Inches(5.72)
    h6 = Inches(5.0)

    # Left: 3-Way Conflict Engine
    cl = create_card(s6, Inches(0.8), Inches(1.65), col_w6, h6)
    tfl = cl.text_frame
    tfl.word_wrap = True
    p = tfl.paragraphs[0]
    p.text = "Deterministic 3-Way Conflict Resolution"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = NAVY

    left_points = [
        ("Base Version Tracking", "Every client edit carries baseVersion. When pushing, if server version > baseVersion, a conflict is detected."),
        ("HTTP 409 Conflict Payload", "Server rejects stale writes without data loss, returning both the server state and client draft."),
        ("Interactive Review UI", "Surfaces a live 3-way visual diff (Local Draft vs. Server Version) in the Review Inbox."),
        ("Resolution Strategies", "Students can choose 'Keep Mine', 'Accept Server', or 'Merge Both' without losing a single keystroke.")
    ]
    for title, desc in left_points:
        p = tfl.add_paragraph()
        p.text = f"• {title}: "
        p.font.bold = True
        p.font.size = Pt(12)
        p.font.color.rgb = TEAL
        p.space_before = Pt(10)
        r = p.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right: Yjs CRDT Real-Time Collaboration
    cr = create_card(s6, Inches(6.81), Inches(1.65), col_w6, h6)
    tfr = cr.text_frame
    tfr.word_wrap = True
    p = tfr.paragraphs[0]
    p.text = "The Advanced Twist: Yjs CRDT Co-Editing"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = BLUE

    right_points = [
        ("Mathematical Commutativity", "Operations commute (A * B = B * A). Concurrent edits merge deterministically without a central coordinator."),
        ("Real-Time Peer Presence", "Visual collaborator avatars and caret tracking let group study peers see live edits across network hops."),
        ("Offline Peer Independence", "Students can work offline on shared lab notes for hours; upon reconnecting, all edits merge seamlessly."),
        ("Zero Lost Keystrokes", "Avoids the classic Google Docs 'reconnecting... you have been disconnected' lockouts.")
    ]
    for title, desc in right_points:
        p = tfr.add_paragraph()
        p.text = f"• {title}: "
        p.font.bold = True
        p.font.size = Pt(12)
        p.font.color.rgb = BLUE
        p.space_before = Pt(10)
        r = p.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 7: Accessibility & Production Inclusivity (WCAG 2.2 AA)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "Inclusivity: Fully Accessible Under WCAG 2.2 AA")

    # 3 Cards
    w7 = Inches(3.72)
    h7 = Inches(4.9)
    top7 = Inches(1.7)

    acc_cards = [
        {
            "title": "Perceivable & Screen Readers",
            "points": [
                ("ARIA Live Regions", "Sync state changes ('Offline', 'Syncing 1/3', 'Synced') are announced to screen readers via polite live regions."),
                ("Accessible Form Controls", "All inputs and textareas have explicit aria-describedby and role associations for rubrics and character counts."),
                ("WCAG AAA Color Contrast", "Text meets high-contrast ratios (minimum 7:1) ensuring legibility on low-brightness screens in outdoor sun.")
            ]
        },
        {
            "title": "Operable & Keyboard Navigation",
            "points": [
                ("Full Keyboard Control", "Every single feature is navigable via Tab, Shift+Tab, and Enter/Space with high-visibility 3px focus rings."),
                ("Skip Navigation Links", "Bypasses header and sidebar directly to main learning content with single keystroke."),
                ("Reduced Motion Support", "prefers-reduced-motion media query disables animations and smooth scrolls for vestibular sensitivity.")
            ]
        },
        {
            "title": "Understandable & Truthful UI",
            "points": [
                ("No False Spinners", "Never traps users in infinite loading states; transparently states queue counts and next scheduled retry."),
                ("Human-Centric Error States", "Actionable guidance instead of cryptic HTTP error codes: 'Your work is safe on this device.'"),
                ("Zero Automated Audit Violations", "Automated Playwright axe-core regression suite confirms 0 critical/serious accessibility violations.")
            ]
        }
    ]

    for i, ac in enumerate(acc_cards):
        c = create_card(s7, Inches(0.8) + (w7 + gap3)*i, top7, w7, h7)
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = ac["title"]
        p.font.size = Pt(15.5)
        p.font.bold = True
        p.font.color.rgb = NAVY

        for title, desc in ac["points"]:
            p = tf.add_paragraph()
            p.text = f"• {title}: "
            p.font.bold = True
            p.font.size = Pt(12)
            p.font.color.rgb = TEAL
            p.space_before = Pt(12)
            r = p.add_run()
            r.text = desc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 8: Test Results, Demo Video & Production Deployment
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "Verification, Production Deployment & Live Links")

    # Top metrics bar
    m_card = create_card(s8, Inches(0.8), Inches(1.65), Inches(11.733), Inches(1.4), bg_color=TEAL_BG, border_color=TEAL)
    mtf = m_card.text_frame
    mtf.word_wrap = True
    p = mtf.paragraphs[0]
    p.text = "VERIFIED IMPACT & TEST RESULTS"
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = TEAL

    p2 = mtf.add_paragraph()
    p2.text = "108 / 108 Automated Tests Passing  |  0 Data Loss in Kill Tests  |  WCAG 2.2 AA Compliant"
    p2.font.size = Pt(18)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p2.space_before = Pt(4)

    p3 = mtf.add_paragraph()
    p3.text = "43 Protocol Tests (HLC, idempotency, schemas)  ·  33 Server Tests (Fastify & D1 sync engine)  ·  32 Client Integration Tests"
    p3.font.size = Pt(12)
    p3.font.color.rgb = TEXT_MUTED
    p3.space_before = Pt(4)

    # 3 Bottom Links / Assets Cards
    w8 = Inches(3.72)
    top8 = Inches(3.3)
    h8 = Inches(3.55)

    # Card 1: Production
    c_live = create_card(s8, Inches(0.8), top8, w8, h8)
    tf = c_live.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Live Cloudflare Production"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = BLUE

    lp1 = tf.add_paragraph()
    lp1.text = "🌐 edusync-tus.pages.dev"
    lp1.font.bold = True
    lp1.font.size = Pt(13)
    lp1.font.color.rgb = NAVY
    lp1.space_before = Pt(8)

    bullets_l = [
        "Deployed globally across 300+ Cloudflare edge locations.",
        "Instant cold starts with HTTP/2 and Brotli asset compression.",
        "Interactive connection simulator lets judges test offline mode live in any browser."
    ]
    for b in bullets_l:
        bp = tf.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(11.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(6)

    # Card 2: Demo Video
    c_vid = create_card(s8, Inches(0.8) + w8 + gap3, top8, w8, h8)
    tf = c_vid.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "2-Minute Demo Video"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = TEAL

    lp2 = tf.add_paragraph()
    lp2.text = "🎬 assets/EduSync-Demo.mp4"
    lp2.font.bold = True
    lp2.font.size = Pt(13)
    lp2.font.color.rgb = NAVY
    lp2.space_before = Pt(8)

    bullets_v = [
        "Duration: 105.6s (720p HD, 25 FPS, clean silent screen capture).",
        "Animated custom cursor shows exact mouse hovers and click ripples.",
        "Live caption HUD explains offline caching, op-logs, kill test, and Yjs CRDT merges."
    ]
    for b in bullets_v:
        bp = tf.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(11.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(6)

    # Card 3: GitHub Repo
    c_git = create_card(s8, Inches(0.8) + (w8 + gap3)*2, top8, w8, h8)
    tf = c_git.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Open-Source Codebase"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = NAVY

    lp3 = tf.add_paragraph()
    lp3.text = "📦 github.com/blank-0007/edusync"
    lp3.font.bold = True
    lp3.font.size = Pt(13)
    lp3.font.color.rgb = NAVY
    lp3.space_before = Pt(8)

    bullets_g = [
        "Clean monorepo architecture: @edusync/protocol, server, and web.",
        "Full reproduction instructions: npm run dev, npm test, npm run verify.",
        "Includes PDF project proposal, judge evaluation matrix, and architecture diagrams."
    ]
    for b in bullets_g:
        bp = tf.add_paragraph()
        bp.text = "• " + b
        bp.font.size = Pt(11.5)
        bp.font.color.rgb = TEXT_MUTED
        bp.space_before = Pt(6)

    # =========================================================================
    # SLIDE 9: Conclusion & Judge Q&A (Dark Theme)
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    bg9 = s9.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg9.fill.solid()
    bg9.fill.fore_color.rgb = NAVY
    bg9.line.fill.background()

    # Title
    t_box9 = s9.shapes.add_textbox(Inches(1.0), Inches(1.2), Inches(11.333), Inches(1.5))
    tf9 = t_box9.text_frame
    tf9.word_wrap = True
    p = tf9.paragraphs[0]
    p.text = "EduSync: The Future of Offline-First Learning"
    p.font.size = Pt(40)
    p.font.bold = True
    p.font.color.rgb = WHITE

    p2 = tf9.add_paragraph()
    p2.text = "Education should never halt when connectivity drops."
    p2.font.size = Pt(20)
    p2.font.color.rgb = RGBColor(143, 209, 198)
    p2.space_before = Pt(6)

    # 3 Summary Cards
    w9 = Inches(3.55)
    gap9 = Inches(0.34)
    top9 = Inches(2.9)
    h9 = Inches(2.6)

    recap_cards = [
        ("Zero Data Loss Guarantee", "Every keystroke and submit attempt is saved synchronously to local IndexedDB before touching the wire. Survives device death.", TEAL),
        ("Idempotent & Commutative", "Client ULIDs prevent duplicate submissions; Yjs CRDTs guarantee mathematical convergence across concurrent offline collaborators.", BLUE),
        ("Production & WCAG Ready", "108/108 tests passing, WCAG 2.2 AA compliant, live on Cloudflare Pages, ready for real students worldwide.", AMBER)
    ]

    for i, (rtitle, rdesc, rcolor) in enumerate(recap_cards):
        c = create_card(s9, Inches(1.0) + (w9 + gap9)*i, top9, w9, h9, bg_color=NAVY_LIGHT, border_color=rcolor)
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = rtitle
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = rcolor

        desc_p = tf.add_paragraph()
        desc_p.text = rdesc
        desc_p.font.size = Pt(13)
        desc_p.font.color.rgb = TEXT_LIGHT
        desc_p.space_before = Pt(10)

    # Q&A Banner
    qa = s9.shapes.add_textbox(Inches(1.0), Inches(5.85), Inches(11.333), Inches(1.0))
    qtf = qa.text_frame
    qp = qtf.paragraphs[0]
    qp.text = "THANK YOU! QUESTIONS & FEEDBACK"
    qp.font.size = Pt(22)
    qp.font.bold = True
    qp.font.color.rgb = WHITE
    qp.alignment = PP_ALIGN.CENTER

    qp2 = qtf.add_paragraph()
    qp2.text = "Live Demo: edusync-tus.pages.dev   |   Repository: github.com/blank-0007/edusync"
    qp2.font.size = Pt(14)
    qp2.font.color.rgb = RGBColor(148, 163, 184)
    qp2.alignment = PP_ALIGN.CENTER
    qp2.space_before = Pt(4)

    prs.save(output_path)
    print(f"✅ Presentation saved to {output_path}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "EduSync-Presentation.pptx"
    build_presentation(out)
