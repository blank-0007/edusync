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
    blank_layout = prs.slide_layouts[6]

    # Vibrant & Modern Color Palette
    NAVY_DARK = RGBColor(11, 20, 38)     # #0B1426
    NAVY_CARD = RGBColor(19, 34, 60)     # #13223C
    TEAL = RGBColor(13, 148, 136)        # #0D9488 (Vibrant Teal)
    TEAL_LIGHT = RGBColor(204, 251, 241) # #CCFBF1
    BLUE = RGBColor(37, 99, 235)         # #2563EB (Electric Blue)
    BLUE_LIGHT = RGBColor(219, 234, 254) # #DBEAFE
    PURPLE = RGBColor(124, 58, 237)      # #7C3AED (Vibrant Purple)
    PURPLE_LIGHT = RGBColor(237, 233, 254) # #EDE9FE
    AMBER = RGBColor(217, 119, 6)        # #D97706 (Amber)
    AMBER_LIGHT = RGBColor(254, 243, 199)# #FEF3C7
    ROSE = RGBColor(225, 29, 72)         # #E11D48 (Rose/Red)
    ROSE_LIGHT = RGBColor(255, 228, 230) # #FFE4E6
    GREEN = RGBColor(16, 185, 129)       # #10B981 (Emerald Green)
    GREEN_LIGHT = RGBColor(209, 250, 229)# #D1FAE5

    WHITE = RGBColor(255, 255, 255)
    SLIDE_BG = RGBColor(248, 250, 252)   # #F8FAFC
    CARD_BG = RGBColor(255, 255, 255)
    CARD_BORDER = RGBColor(226, 232, 240)# #E2E8F0
    TEXT_NAVY = RGBColor(15, 23, 42)     # #0F172A
    TEXT_MUTED = RGBColor(71, 85, 105)   # #475569
    TEXT_LIGHT = RGBColor(226, 232, 240) # #E2E8F0

    def set_slide_background(slide, color):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.fill.background()
        return bg

    def add_header(slide, title, category="EDUSYNC · TECHNICAL PRESENTATION", dark=False):
        # Category Pill
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.4), Inches(3.2), Inches(0.35))
        pill.fill.solid()
        pill.fill.fore_color.rgb = TEAL if dark else TEAL_LIGHT
        pill.line.fill.background()
        ptf = pill.text_frame
        ptf.vertical_anchor = MSO_ANCHOR.MIDDLE
        pp = ptf.paragraphs[0]
        pp.text = category.upper()
        pp.font.size = Pt(9.5)
        pp.font.bold = True
        pp.font.color.rgb = WHITE if dark else TEAL
        pp.alignment = PP_ALIGN.CENTER

        # Title
        tbox = slide.shapes.add_textbox(Inches(0.8), Inches(0.78), Inches(11.7), Inches(0.75))
        tf = tbox.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(24)
        p.font.bold = True
        p.font.color.rgb = WHITE if dark else TEXT_NAVY

    def create_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER, border_width=1.5):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        shape.line.color.rgb = border_color
        shape.line.width = Pt(border_width)
        return shape

    def add_colored_badge(slide, left, top, width, height, text, bg_color, text_color):
        badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        badge.fill.solid()
        badge.fill.fore_color.rgb = bg_color
        badge.line.fill.background()
        tf = badge.text_frame
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.text = text
        p.font.size = Pt(10)
        p.font.bold = True
        p.font.color.rgb = text_color
        p.alignment = PP_ALIGN.CENTER
        return badge

    # =========================================================================
    # SLIDE 1: Title Slide (Vibrant Dark Theme)
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1, NAVY_DARK)

    # Top Tag
    add_colored_badge(s1, Inches(0.9), Inches(0.9), Inches(3.4), Inches(0.4), "OFFLINE-FIRST LEARNING INFRASTRUCTURE", TEAL, WHITE)

    # Main Title
    t_box = s1.shapes.add_textbox(Inches(0.9), Inches(1.4), Inches(11.5), Inches(1.6))
    tf = t_box.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "EduSync"
    p1.font.size = Pt(56)
    p1.font.bold = True
    p1.font.color.rgb = WHITE

    p2 = tf.add_paragraph()
    p2.text = "Zero-Data-Loss Learning for Intermittent & Rural Connectivity"
    p2.font.size = Pt(22)
    p2.font.color.rgb = TEAL_LIGHT
    p2.space_before = Pt(4)

    # Hero Paradigm Card
    p_card = create_card(s1, Inches(0.9), Inches(3.2), Inches(11.533), Inches(1.3), bg_color=NAVY_CARD, border_color=TEAL, border_width=2)
    ptf = p_card.text_frame
    ptf.word_wrap = True
    pp1 = ptf.paragraphs[0]
    pp1.text = "CORE PARADIGM SHIFT: \"The device is the source of truth, the network is an optimization.\""
    pp1.font.size = Pt(15.5)
    pp1.font.bold = True
    pp1.font.color.rgb = WHITE

    pp2 = ptf.add_paragraph()
    pp2.text = "• Every edit commits locally to IndexedDB with 0ms latency before touching the wire."
    pp2.font.size = Pt(12.5)
    pp2.font.color.rgb = TEXT_LIGHT
    pp2.space_before = Pt(6)

    pp3 = ptf.add_paragraph()
    pp3.text = "• Jittered delta sync, ULID idempotency tokens, and Yjs CRDTs eliminate loss, duplicates, and conflicts."
    pp3.font.size = Pt(12.5)
    pp3.font.color.rgb = TEXT_LIGHT
    pp3.space_before = Pt(3)

    # 4 Stat/Feature Cards across bottom
    card_w = Inches(2.7)
    card_gap = Inches(0.24)
    card_y = Inches(4.75)
    card_h = Inches(1.8)

    stat_data = [
        ("108 / 108", "Tests Passing", "Vitest suite across protocol, server & client", GREEN, GREEN_LIGHT),
        ("0 ms", "Offline Latency", "Instant optimistic local writes in IndexedDB", BLUE, BLUE_LIGHT),
        ("0", "Keystrokes Lost", "Survives tab crash & device death (Kill Test)", PURPLE, PURPLE_LIGHT),
        ("WCAG 2.2 AA", "Accessible", "Screen readers, 7:1 contrast & full keyboard", AMBER, AMBER_LIGHT),
    ]

    for i, (num, label, desc, color, bg_col) in enumerate(stat_data):
        sc = create_card(s1, Inches(0.9) + (card_w + card_gap)*i, card_y, card_w, card_h, bg_color=NAVY_CARD, border_color=color, border_width=1.5)
        stf = sc.text_frame
        stf.word_wrap = True
        
        sp1 = stf.paragraphs[0]
        sp1.text = num
        sp1.font.size = Pt(24)
        sp1.font.bold = True
        sp1.font.color.rgb = color

        sp2 = stf.add_paragraph()
        sp2.text = label
        sp2.font.size = Pt(12)
        sp2.font.bold = True
        sp2.font.color.rgb = WHITE
        sp2.space_before = Pt(2)

        sp3 = stf.add_paragraph()
        sp3.text = desc
        sp3.font.size = Pt(10.5)
        sp3.font.color.rgb = TEXT_LIGHT
        sp3.space_before = Pt(4)

    # Footer links
    fbox = s1.shapes.add_textbox(Inches(0.9), Inches(6.75), Inches(11.533), Inches(0.4))
    ftf = fbox.text_frame
    fp = ftf.paragraphs[0]
    fp.text = "🌐 Live App: edusync-tus.pages.dev   |   📦 GitHub: github.com/blank-0007/edusync   |   🎬 Demo: assets/EduSync-Demo.mp4"
    fp.font.size = Pt(11.5)
    fp.font.color.rgb = RGBColor(148, 163, 184)

    # =========================================================================
    # SLIDE 2: The Problem (Vibrant 3-Card Visual Breakdown)
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2, SLIDE_BG)
    add_header(s2, "The Problem: Why Traditional EdTech Fails on Real Networks")

    w3 = Inches(3.68)
    gap3 = Inches(0.34)
    top2 = Inches(1.65)
    h2 = Inches(5.1)

    prob_cards = [
        {
            "tag": "REAL-WORLD DROPS",
            "tag_bg": ROSE_LIGHT,
            "tag_fg": ROSE,
            "title": "Intermittent Connectivity",
            "border": ROSE,
            "points": [
                ("Commute & Weather Drops", "Rural cellular towers flicker during commutes, storms, or power cuts."),
                ("False Online Status", "navigator.onLine lies — reports 'online' even behind dead Wi-Fi routers."),
                ("Frozen UI Spinners", "Traditional LMS locks the screen for 30s synchronous HTTP timeouts."),
                ("Blocked Access", "Students cannot open textbook modules or rubrics once disconnected.")
            ]
        },
        {
            "tag": "FATAL DATA LOSS",
            "tag_bg": AMBER_LIGHT,
            "tag_fg": AMBER,
            "title": "Exam & Assignment Wipeouts",
            "border": AMBER,
            "points": [
                ("Wiped Submissions", "Student writes a 500-word essay, clicks Submit in a signal dip, and the page reloads blank."),
                ("Duplicate Records", "Panicked students spam Submit, spawning duplicate submissions or rate limits."),
                ("Silent Overwrites", "Naive Last-Write-Wins wipes simultaneous offline group edits with 0 warning."),
                ("Loss of Trust", "Fear of losing work causes stress and hampers learning confidence.")
            ]
        },
        {
            "tag": "THE DIGITAL DIVIDE",
            "tag_bg": PURPLE_LIGHT,
            "tag_fg": PURPLE,
            "title": "The False-Optimism Trap",
            "border": PURPLE,
            "points": [
                ("Session Expiration", "Auth cookies expire offline; on reconnect, unsaved work is trashed by login redirects."),
                ("Thundering Herds", "When Wi-Fi returns, 50 devices retry simultaneously, crashing school routers."),
                ("Widening Inequity", "Students in low-connectivity areas are penalized for infrastructure failures."),
                ("High Abandonment", "Frustrated students give up on digital assignments entirely.")
            ]
        }
    ]

    for i, pdata in enumerate(prob_cards):
        left_pos = Inches(0.8) + (w3 + gap3)*i
        c = create_card(s2, left_pos, top2, w3, h2, border_color=pdata["border"], border_width=2)
        
        # Tag Badge
        add_colored_badge(s2, left_pos + Inches(0.24), top2 + Inches(0.24), Inches(2.2), Inches(0.35), pdata["tag"], pdata["tag_bg"], pdata["tag_fg"])

        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.7)
        tf.margin_left = tf.margin_right = Inches(0.24)

        p = tf.paragraphs[0]
        p.text = pdata["title"]
        p.font.size = Pt(18)
        p.font.bold = True
        p.font.color.rgb = TEXT_NAVY

        for p_title, p_desc in pdata["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {p_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11.5)
            bp.font.color.rgb = TEXT_NAVY
            bp.space_before = Pt(10)
            
            run = bp.add_run()
            run.text = p_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 3: The Tech Stack (4 Color-Coded Vertical Pillars)
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3, SLIDE_BG)
    add_header(s3, "The Tech Stack: Built Specifically for Offline Durability")

    w4 = Inches(2.74)
    gap4 = Inches(0.25)
    top3 = Inches(1.65)
    h3 = Inches(5.1)

    stack_cards = [
        {
            "tag": "CLIENT & UI",
            "tag_bg": BLUE_LIGHT,
            "tag_fg": BLUE,
            "title": "React 18 & Vite",
            "border": BLUE,
            "points": [
                ("React 18", "Optimistic state updates, 0ms input lag, zero blocking spinners."),
                ("TypeScript (Strict)", "End-to-end type safety & contract validation across client & server."),
                ("Vite Build Engine", "Modular ESM asset bundling for instant cold starts and caching."),
                ("WCAG 2.2 AA", "Strict semantic HTML, ARIA live regions, and keyboard-first accessibility.")
            ]
        },
        {
            "tag": "OFFLINE ENGINE",
            "tag_bg": TEAL_LIGHT,
            "tag_fg": TEAL,
            "title": "IndexedDB & Yjs",
            "border": TEAL,
            "points": [
                ("IndexedDB (IDB)", "Transactional structured persistence surviving browser death & reboots."),
                ("Service Worker", "Cache-First strategy; serves full lessons and media with 0ms latency."),
                ("Append-Only Op-Log", "Every keystroke saved immediately as an immutable HLC operation."),
                ("Yjs CRDTs", "Commutative state-based CRDTs for multi-peer concurrent co-editing.")
            ]
        },
        {
            "tag": "SERVER & EDGE",
            "tag_bg": PURPLE_LIGHT,
            "tag_fg": PURPLE,
            "title": "Fastify & Cloudflare D1",
            "border": PURPLE,
            "points": [
                ("Fastify REST/WS", "High-throughput, low-latency Node.js API with native JSON schema validation."),
                ("Cloudflare D1 & Workers", "Globally distributed serverless SQLite database on 300+ edge nodes."),
                ("Idempotency Engine", "Unique DB index on client ULID safely absorbs all duplicate retries."),
                ("Change Feed Cursors", "Incremental sync cursors stream deltas; never re-downloads full tables.")
            ]
        },
        {
            "tag": "VERIFICATION",
            "tag_bg": AMBER_LIGHT,
            "tag_fg": AMBER,
            "title": "Vitest & Playwright",
            "border": AMBER,
            "points": [
                ("Vitest Suite (108)", "108/108 automated unit and integration tests across 3 monorepo packages."),
                ("Playwright E2E", "Automated browser offline emulation, crash-recovery, and kill-test."),
                ("axe-core Auditing", "Automated accessibility regression tests ensuring 0 color or ARIA violations."),
                ("FFmpeg Automation", "Automated screen capture with animated mouse cursor and caption HUD.")
            ]
        }
    ]

    for i, sdata in enumerate(stack_cards):
        left_pos = Inches(0.8) + (w4 + gap4)*i
        c = create_card(s3, left_pos, top3, w4, h3, border_color=sdata["border"], border_width=2)
        
        # Tag Badge
        add_colored_badge(s3, left_pos + Inches(0.2), top3 + Inches(0.2), Inches(2.34), Inches(0.35), sdata["tag"], sdata["tag_bg"], sdata["tag_fg"])

        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.68)
        tf.margin_left = tf.margin_right = Inches(0.2)

        p = tf.paragraphs[0]
        p.text = sdata["title"]
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = TEXT_NAVY

        for s_title, s_desc in sdata["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {s_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = TEXT_NAVY
            bp.space_before = Pt(9)
            
            run = bp.add_run()
            run.text = s_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 4: Architecture & The 5-Step Pipeline Flowchart (HIGH VISUAL)
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4, SLIDE_BG)
    add_header(s4, "System Architecture: End-to-End Synchronization Pipeline")

    # 5-Step Visual Flowchart Banner across top
    flow_steps = [
        ("1. Action", "Student writes / clicks", BLUE, BLUE_LIGHT),
        ("2. Local Log", "IndexedDB HLC op-log", TEAL, TEAL_LIGHT),
        ("3. State Machine", "OFFLINE / SYNCING status", PURPLE, PURPLE_LIGHT),
        ("4. Delta Drain", "Jittered backoff queue", AMBER, AMBER_LIGHT),
        ("5. Reconcile", "Cloudflare D1 / 409 check", GREEN, GREEN_LIGHT),
    ]

    step_w = Inches(2.1)
    step_gap = Inches(0.3)
    step_y = Inches(1.6)
    step_h = Inches(1.1)

    for i, (title, sub, col, bg_col) in enumerate(flow_steps):
        s_left = Inches(0.8) + (step_w + step_gap)*i
        node = create_card(s4, s_left, step_y, step_w, step_h, bg_color=bg_col, border_color=col, border_width=2)
        ntf = node.text_frame
        ntf.word_wrap = True
        ntf.margin_top = Inches(0.18)
        ntf.margin_left = ntf.margin_right = Inches(0.12)
        
        np1 = ntf.paragraphs[0]
        np1.text = title
        np1.font.size = Pt(13)
        np1.font.bold = True
        np1.font.color.rgb = col
        np1.alignment = PP_ALIGN.CENTER

        np2 = ntf.add_paragraph()
        np2.text = sub
        np2.font.size = Pt(10)
        np2.font.color.rgb = TEXT_NAVY
        np2.alignment = PP_ALIGN.CENTER
        np2.space_before = Pt(2)

        # Arrow between steps
        if i < 4:
            arrow_left = s_left + step_w + Inches(0.06)
            arrow = s4.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, arrow_left, step_y + Inches(0.38), Inches(0.18), Inches(0.24))
            arrow.fill.solid()
            arrow.fill.fore_color.rgb = col
            arrow.line.fill.background()

    # 3 Deep Dive Architecture Columns below
    top_arch = Inches(2.95)
    h_arch = Inches(3.8)

    arch_sections = [
        {
            "tag": "CLIENT DURABILITY",
            "tag_bg": TEAL_LIGHT,
            "tag_fg": TEAL,
            "title": "Local Storage & Op-Log",
            "border": TEAL,
            "points": [
                ("0ms Synchronous Writes", "Edits commit locally to IndexedDB before touching any network socket."),
                ("Hybrid Logical Clocks", "Merges physical wall-clock millis with monotonic logical counter."),
                ("Clock Drift Immune", "Causal ordering is mathematically guaranteed even if system clocks drift."),
                ("Truthful UI Indicators", "Explicit badges: 'Offline · 2 changes queued' — zero false optimism.")
            ]
        },
        {
            "tag": "TRANSPORT LAYER",
            "tag_bg": AMBER_LIGHT,
            "tag_fg": AMBER,
            "title": "Resilient Queue Drain",
            "border": AMBER,
            "points": [
                ("FIFO Delta Execution", "Pending operations flush in sequential order upon verified connection."),
                ("Full-Jitter Backoff", "sleep = min(30s, base * 2^n) * rand(0.5, 1.5) prevents server stampedes."),
                ("Incremental Cursors", "Client and server exchange delta cursors; never re-downloads full tables."),
                ("Active Connectivity Probing", "Periodic lightweight HEAD probes detect real captive portal connectivity.")
            ]
        },
        {
            "tag": "SERVER RECONCILIATION",
            "tag_bg": BLUE_LIGHT,
            "tag_fg": BLUE,
            "title": "Authoritative Edge Reconcile",
            "border": BLUE,
            "points": [
                ("ACID Relational Storage", "Cloudflare D1 distributed edge database + Fastify SQLite engine."),
                ("ULID Idempotency Constraint", "Unique DB index on (assignmentId, userId, submissionId) absorbs retries."),
                ("HTTP 409 Conflict Guard", "Server checks baseVersion; returns 409 + diff if concurrent edits collide."),
                ("Audit Trail History", "Preserves both device timestamp and server receipt timestamp.")
            ]
        }
    ]

    for i, adata in enumerate(arch_sections):
        left_pos = Inches(0.8) + (w3 + gap3)*i
        c = create_card(s4, left_pos, top_arch, w3, h_arch, border_color=adata["border"], border_width=2)
        
        add_colored_badge(s4, left_pos + Inches(0.2), top_arch + Inches(0.18), Inches(2.4), Inches(0.32), adata["tag"], adata["tag_bg"], adata["tag_fg"])

        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.55)
        tf.margin_left = tf.margin_right = Inches(0.2)

        p = tf.paragraphs[0]
        p.text = adata["title"]
        p.font.size = Pt(16.5)
        p.font.bold = True
        p.font.color.rgb = TEXT_NAVY

        for a_title, a_desc in adata["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {a_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = TEXT_NAVY
            bp.space_before = Pt(8)
            
            run = bp.add_run()
            run.text = a_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 5: Solving the "Very Hard" Engineering Challenges (4 Quadrants)
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5, SLIDE_BG)
    add_header(s5, "Solving the 'Very Hard' Engineering Challenges")

    quad_w = Inches(5.7)
    quad_h = Inches(2.45)
    x1 = Inches(0.8)
    x2 = Inches(6.83)
    y1 = Inches(1.65)
    y2 = Inches(4.3)

    challenges = [
        (x1, y1, "1. Exactly-Once Submission Under Drops", BLUE, BLUE_LIGHT, [
            ("The Challenge", "Network drops mid-submit; student frantically clicks Submit 5 times."),
            ("The Mechanism", "Client mints a canonical ULID submissionId before network dispatch."),
            ("The Invariant", "Database enforces unique constraint on (assignmentId, userId, submissionId)."),
            ("The Result", "All 5 retries return the exact same canonical receipt. 0 duplicates.")
        ]),
        (x2, y1, "2. The 'Kill Test' (Total Crash Recovery)", ROSE, ROSE_LIGHT, [
            ("The Challenge", "Low-end devices run out of battery or kill background browser tabs."),
            ("The Mechanism", "Synchronous IndexedDB writes occur BEFORE React component re-renders."),
            ("The Invariant", "Op-log, unsaved drafts, and submission receipts persist on disk."),
            ("The Result", "100% crash recovery. Device reboots with zero lost keystrokes.")
        ]),
        (x1, y2, "3. Causality & Clock Skew (HLC)", TEAL, TEAL_LIGHT, [
            ("The Challenge", "Mobile clocks drift by hours, causing naive timestamps to corrupt order."),
            ("The Mechanism", "Hybrid Logical Clocks pair physical millis with monotonic logical count."),
            ("The Invariant", "l.j := max(l.j, l.msg, pt.j) + 1 guarantees monotonic causality."),
            ("The Result", "Distributed operations sort into perfect causal order with zero NTP skew.")
        ]),
        (x2, y2, "4. Exponential Backoff with Full Jitter", AMBER, AMBER_LIGHT, [
            ("The Challenge", "Reconnecting Wi-Fi triggers a thundering herd that crashes school servers."),
            ("The Mechanism", "Full-jitter formula: sleep = min(30s, 500ms * 2^attempt) * rand(0.5, 1.5)."),
            ("The Invariant", "Prevents synchronized retry spikes across classrooms of 50+ students."),
            ("The Result", "Smooth server load distribution and reliable background synchronization.")
        ])
    ]

    for cx, cy, ctitle, ccolor, cbg, cpoints in challenges:
        card = create_card(s5, cx, cy, quad_w, quad_h, border_color=ccolor, border_width=2)
        
        # Title badge
        add_colored_badge(s5, cx + Inches(0.2), cy + Inches(0.18), Inches(4.5), Inches(0.32), ctitle, cbg, ccolor)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.55)
        tf.margin_left = tf.margin_right = Inches(0.2)

        for i, (p_title, p_desc) in enumerate(cpoints):
            bp = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            bp.text = f"• {p_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = ccolor if p_title == "The Result" else TEXT_NAVY
            if i > 0:
                bp.space_before = Pt(4)

            run = bp.add_run()
            run.text = p_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 6: Visual Conflict Resolution & The CRDT Twist
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6, SLIDE_BG)
    add_header(s6, "Conflict Resolution & The CRDT Collaborative Twist")

    col_w6 = Inches(5.7)
    h6 = Inches(5.1)

    # Left: 3-Way Conflict Engine
    cl = create_card(s6, Inches(0.8), Inches(1.65), col_w6, h6, border_color=TEAL, border_width=2)
    add_colored_badge(s6, Inches(1.0), Inches(1.85), Inches(3.4), Inches(0.35), "DETERMINISTIC 3-WAY CONFLICTS", TEAL_LIGHT, TEAL)
    
    tfl = cl.text_frame
    tfl.word_wrap = True
    tfl.margin_top = Inches(0.65)
    tfl.margin_left = tfl.margin_right = Inches(0.24)

    p = tfl.paragraphs[0]
    p.text = "Human-in-the-Loop Conflict Resolution"
    p.font.size = Pt(18)
    p.font.bold = True
    p.font.color.rgb = TEXT_NAVY

    left_points = [
        ("Base Version Tracking", "Every client edit carries baseVersion. If server version > baseVersion, a conflict is detected."),
        ("HTTP 409 Safe Rejection", "Server refuses to silently overwrite data; returns server state + incoming client draft."),
        ("Side-by-Side Visual Diff", "Review Inbox UI highlights differences visually (Local Draft vs. Server Version)."),
        ("Three Resolution Options", "Students select 'Keep Mine', 'Accept Server', or 'Merge Both' with 0 lost words."),
        ("Audit Verification", "Both versions are archived with full cryptographic hashes for instructor review.")
    ]
    for title, desc in left_points:
        p = tfl.add_paragraph()
        p.text = f"• {title}: "
        p.font.bold = True
        p.font.size = Pt(11.5)
        p.font.color.rgb = TEAL
        p.space_before = Pt(9)
        r = p.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right: Yjs CRDT Collaboration
    cr = create_card(s6, Inches(6.83), Inches(1.65), col_w6, h6, border_color=PURPLE, border_width=2)
    add_colored_badge(s6, Inches(7.03), Inches(1.85), Inches(3.4), Inches(0.35), "THE ADVANCED TWIST: YJS CRDTS", PURPLE_LIGHT, PURPLE)

    tfr = cr.text_frame
    tfr.word_wrap = True
    tfr.margin_top = Inches(0.65)
    tfr.margin_left = tfr.margin_right = Inches(0.24)

    p = tfr.paragraphs[0]
    p.text = "Mathematical Commutative Co-Editing"
    p.font.size = Pt(18)
    p.font.bold = True
    p.font.color.rgb = TEXT_NAVY

    right_points = [
        ("Mathematical Commutativity", "Operations commute (A * B = B * A). Concurrent edits merge deterministically."),
        ("Real-Time Peer Avatars", "Visual peer presence and live selection carets let study groups collaborate smoothly."),
        ("Independent Offline Editing", "Students work disconnected on shared lab notes for hours without coordinator lockouts."),
        ("Seamless Convergence", "Upon reconnecting, CRDT state vectors merge instantly without a single lost keystroke."),
        ("No Disconnect Lockouts", "Eliminates the frustrating Google Docs 'You are offline / editing disabled' barrier.")
    ]
    for title, desc in right_points:
        p = tfr.add_paragraph()
        p.text = f"• {title}: "
        p.font.bold = True
        p.font.size = Pt(11.5)
        p.font.color.rgb = PURPLE
        p.space_before = Pt(9)
        r = p.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 7: Inclusivity & Accessibility (WCAG 2.2 AA)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7, SLIDE_BG)
    add_header(s7, "Inclusivity: Fully Accessible Under WCAG 2.2 AA")

    acc_cards = [
        {
            "tag": "PERCEIVABLE",
            "tag_bg": TEAL_LIGHT,
            "tag_fg": TEAL,
            "title": "Screen Readers & Contrast",
            "border": TEAL,
            "points": [
                ("ARIA Live Regions", "Announces sync state changes ('Offline', 'Syncing 1/3', 'Synced') automatically."),
                ("Accessible Form Controls", "Textareas explicitly link to rubrics and word counts via aria-describedby."),
                ("7:1+ Contrast Ratio", "Exceeds WCAG AAA; readable on low-brightness mobile screens in glaring outdoor sun."),
                ("Descriptive Alt Text", "All diagrams and visual indicators provide full descriptive text alternatives.")
            ]
        },
        {
            "tag": "OPERABLE",
            "tag_bg": BLUE_LIGHT,
            "tag_fg": BLUE,
            "title": "Full Keyboard Navigation",
            "border": BLUE,
            "points": [
                ("100% Keyboard Accessible", "Every single feature navigable via Tab, Shift+Tab, Space, and Enter."),
                ("Skip Navigation Links", "Bypasses header and sidebar directly to main learning content with 1 keypress."),
                ("Visible 3px Focus Rings", "High-contrast outline makes active elements unambiguous to motor-impaired users."),
                ("Reduced Motion Support", "Respects prefers-reduced-motion media query, disabling animations.")
            ]
        },
        {
            "tag": "UNDERSTANDABLE",
            "tag_bg": AMBER_LIGHT,
            "tag_fg": AMBER,
            "title": "Honest, Audited UX",
            "border": AMBER,
            "points": [
                ("Zero Fake Spinners", "Never traps users in loading screens; displays exact queue and countdown numbers."),
                ("Human-Centric Reassurance", "Clear messaging: 'Your work is saved safely on this device. Retrying in 12s.'"),
                ("Zero Audit Violations", "Automated Playwright axe-core regression suite confirms 0 accessibility errors."),
                ("Consistent Component Design", "Unified design tokens ensure predictable muscle memory across all screens.")
            ]
        }
    ]

    for i, ac in enumerate(acc_cards):
        left_pos = Inches(0.8) + (w3 + gap3)*i
        c = create_card(s7, left_pos, top2, w3, h2, border_color=ac["border"], border_width=2)
        
        add_colored_badge(s7, left_pos + Inches(0.24), top2 + Inches(0.24), Inches(2.2), Inches(0.35), ac["tag"], ac["tag_bg"], ac["tag_fg"])

        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.7)
        tf.margin_left = tf.margin_right = Inches(0.24)

        p = tf.paragraphs[0]
        p.text = ac["title"]
        p.font.size = Pt(18)
        p.font.bold = True
        p.font.color.rgb = TEXT_NAVY

        for a_title, a_desc in ac["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {a_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11.5)
            bp.font.color.rgb = TEXT_NAVY
            bp.space_before = Pt(10)
            
            run = bp.add_run()
            run.text = a_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 8: Test Results, Demo Video & Production Deployment
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8, SLIDE_BG)
    add_header(s8, "Verification, Production Deployment & Live Links")

    # High Impact Top Metrics Banner
    m_card = create_card(s8, Inches(0.8), Inches(1.6), Inches(11.733), Inches(1.3), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=2)
    mtf = m_card.text_frame
    mtf.word_wrap = True
    mtf.margin_top = Inches(0.18)
    mtf.margin_left = Inches(0.28)
    
    mp1 = mtf.paragraphs[0]
    mp1.text = "VERIFIED INVARIANTS & TEST SUITE BREAKDOWN"
    mp1.font.size = Pt(11)
    mp1.font.bold = True
    mp1.font.color.rgb = TEAL

    mp2 = mtf.add_paragraph()
    mp2.text = "108 / 108 Automated Tests Passing  |  0 Data Loss in Kill Tests  |  WCAG 2.2 AA Verified"
    mp2.font.size = Pt(18)
    mp2.font.bold = True
    mp2.font.color.rgb = TEXT_NAVY
    mp2.space_before = Pt(2)

    mp3 = mtf.add_paragraph()
    mp3.text = "• 43 Protocol Tests (HLC clocks, ULID idempotency)   • 33 Server Tests (Fastify & D1 sync engine)   • 32 Client Tests (IndexedDB, UI)"
    mp3.font.size = Pt(12)
    mp3.font.color.rgb = TEXT_MUTED
    mp3.space_before = Pt(4)

    # 3 Bottom Deliverable Cards
    top8 = Inches(3.1)
    h8 = Inches(3.7)

    deliverables = [
        {
            "tag": "LIVE APP",
            "tag_bg": BLUE_LIGHT,
            "tag_fg": BLUE,
            "title": "Cloudflare Global Edge",
            "link": "edusync-tus.pages.dev",
            "border": BLUE,
            "points": [
                ("Instant Cold Starts", "Global edge routing across 300+ Cloudflare edge nodes."),
                ("Interactive Simulator", "Built-in offline connection simulator lets judges test drops live."),
                ("Local IndexedDB", "Inspect browser devtools to verify zero-latency local database storage.")
            ]
        },
        {
            "tag": "DEMO VIDEO",
            "tag_bg": TEAL_LIGHT,
            "tag_fg": TEAL,
            "title": "2-Minute Screen Capture",
            "link": "assets/EduSync-Demo.mp4",
            "border": TEAL,
            "points": [
                ("105.6s Duration", "Clean silent 720p HD screen recording (~2 minutes)."),
                ("Animated Cursor", "Smooth mouse pointer shows hovers, clicks, and typing ripples."),
                ("Live Caption HUD", "Explains offline invariants step-by-step for the judges.")
            ]
        },
        {
            "tag": "OPEN SOURCE",
            "tag_bg": PURPLE_LIGHT,
            "tag_fg": PURPLE,
            "title": "Complete Monorepo",
            "link": "github.com/blank-0007/edusync",
            "border": PURPLE,
            "points": [
                ("Full Documentation", "Includes judge evaluation matrix, proposal, and architecture diagrams."),
                ("Clean Monorepo", "Modular @edusync/protocol, server, and web client workspaces."),
                ("One-Command Verify", "npm test and bash scripts/verify.sh run complete validation.")
            ]
        }
    ]

    for i, d in enumerate(deliverables):
        left_pos = Inches(0.8) + (w3 + gap3)*i
        c = create_card(s8, left_pos, top8, w3, h8, border_color=d["border"], border_width=2)
        
        add_colored_badge(s8, left_pos + Inches(0.2), top8 + Inches(0.18), Inches(1.8), Inches(0.32), d["tag"], d["tag_bg"], d["tag_fg"])

        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.55)
        tf.margin_left = tf.margin_right = Inches(0.2)

        p = tf.paragraphs[0]
        p.text = d["title"]
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = TEXT_NAVY

        lp = tf.add_paragraph()
        lp.text = "🔗 " + d["link"]
        lp.font.size = Pt(11.5)
        lp.font.bold = True
        lp.font.color.rgb = d["tag_fg"]
        lp.space_before = Pt(2)

        for d_title, d_desc in d["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {d_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = TEXT_NAVY
            bp.space_before = Pt(8)
            
            run = bp.add_run()
            run.text = d_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 9: Conclusion & Judge Q&A (Vibrant Dark Theme)
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_background(s9, NAVY_DARK)

    # Title
    t_box9 = s9.shapes.add_textbox(Inches(0.9), Inches(1.0), Inches(11.533), Inches(1.5))
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
    p2.font.color.rgb = TEAL_LIGHT
    p2.space_before = Pt(4)

    # 3 Summary Cards
    w9 = Inches(3.62)
    gap9 = Inches(0.33)
    top9 = Inches(2.7)
    h9 = Inches(2.7)

    recap_cards = [
        ("Zero Data Loss Guarantee", TEAL, [
            ("Local IndexedDB Commit", "Every keystroke saves locally before touching the network."),
            ("The Kill Test", "100% crash durability; survives battery drain & device restart."),
            ("Zero Disconnect Lockouts", "Full access to lessons, rubrics, and offline drafting.")
        ]),
        ("Mathematical Determinism", BLUE, [
            ("ULID Token Idempotency", "Database unique constraints absorb duplicate retries."),
            ("Yjs CRDT Collaboration", "Commutative operations guarantee seamless co-editing."),
            ("HLC Clocks", "Strict causal ordering without reliance on system clock accuracy.")
        ]),
        ("Production & WCAG Ready", AMBER, [
            ("108/108 Tests Passing", "Rigorous automated test coverage across all packages."),
            ("WCAG 2.2 AA Verified", "High contrast, screen reader live regions, and keyboard nav."),
            ("Cloudflare Edge Deployed", "Live globally today at edusync-tus.pages.dev.")
        ])
    ]

    for i, (rtitle, rcolor, rpoints) in enumerate(recap_cards):
        c = create_card(s9, Inches(0.9) + (w9 + gap9)*i, top9, w9, h9, bg_color=NAVY_CARD, border_color=rcolor, border_width=2)
        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.24)
        tf.margin_left = tf.margin_right = Inches(0.24)

        p = tf.paragraphs[0]
        p.text = rtitle
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = rcolor

        for r_title, r_desc in rpoints:
            bp = tf.add_paragraph()
            bp.text = f"• {r_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = WHITE
            bp.space_before = Pt(8)

            run = bp.add_run()
            run.text = r_desc
            run.font.bold = False
            run.font.color.rgb = TEXT_LIGHT

    # Q&A Banner
    qa = s9.shapes.add_textbox(Inches(0.9), Inches(5.75), Inches(11.533), Inches(1.1))
    qtf = qa.text_frame
    qp = qtf.paragraphs[0]
    qp.text = "THANK YOU! QUESTIONS & LIVE DEMO"
    qp.font.size = Pt(24)
    qp.font.bold = True
    qp.font.color.rgb = WHITE
    qp.alignment = PP_ALIGN.CENTER

    qp2 = qtf.add_paragraph()
    qp2.text = "Live App: edusync-tus.pages.dev   |   Repository: github.com/blank-0007/edusync"
    qp2.font.size = Pt(14)
    qp2.font.color.rgb = RGBColor(148, 163, 184)
    qp2.alignment = PP_ALIGN.CENTER
    qp2.space_before = Pt(4)

    prs.save(output_path)
    print(f"✅ Colorful presentation saved to {output_path}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "EduSync-Presentation.pptx"
    build_presentation(out)
