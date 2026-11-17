import sys
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_hackathon_presentation(output_path):
    prs = Presentation()
    # 16:9 widescreen layout
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Color Palette
    NAVY = RGBColor(15, 27, 45)         # #0F1B2D
    BLUE = RGBColor(37, 99, 235)        # #2563EB
    BLUE_LIGHT = RGBColor(238, 242, 255)# #EEF2FF
    TEAL = RGBColor(14, 124, 107)       # #0E7C6B
    TEAL_LIGHT = RGBColor(230, 244, 241)# #E6F4F1
    PURPLE = RGBColor(124, 58, 237)     # #7C3AED
    PURPLE_LIGHT = RGBColor(237, 233, 254)
    AMBER = RGBColor(217, 119, 6)       # #D97706
    AMBER_LIGHT = RGBColor(254, 243, 199)
    ROSE = RGBColor(225, 29, 72)        # #E11D48
    GREEN = RGBColor(16, 185, 129)      # #10B981

    WHITE = RGBColor(255, 255, 255)
    CARD_BG = RGBColor(248, 250, 252)
    CARD_BORDER = RGBColor(226, 232, 240)
    TEXT_DARK = RGBColor(15, 23, 42)
    TEXT_MUTED = RGBColor(71, 85, 105)

    def add_header(slide, title, category="EDUSYNC · HACKATHON PRESENTATION"):
        # Top banner category pill
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.35), Inches(11.733), Inches(0.35))
        ctf = cat_box.text_frame
        ctf.word_wrap = True
        ctf.margin_left = ctf.margin_right = ctf.margin_top = ctf.margin_bottom = 0
        cp = ctf.paragraphs[0]
        cp.text = category.upper()
        cp.font.size = Pt(10)
        cp.font.bold = True
        cp.font.color.rgb = TEAL

        # Title
        t_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.68), Inches(11.733), Inches(0.65))
        tf = t_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(24)
        p.font.bold = True
        p.font.color.rgb = NAVY

    def add_footer(slide, current_page, total_pages=10):
        fbox = slide.shapes.add_textbox(Inches(0.8), Inches(7.05), Inches(11.733), Inches(0.35))
        ftf = fbox.text_frame
        ftf.word_wrap = True
        ftf.margin_left = ftf.margin_right = ftf.margin_top = ftf.margin_bottom = 0
        fp = ftf.paragraphs[0]
        fp.text = "EduSync — Presented by Kaushal"
        fp.font.size = Pt(9.5)
        fp.font.color.rgb = TEXT_MUTED

        clink = ftf.add_paragraph()
        clink.text = "🌐 Live App: edusync-tus.pages.dev   |   📦 github.com/blank-0007/edusync"
        clink.font.size = Pt(9.5)
        clink.font.bold = True
        clink.font.color.rgb = BLUE
        clink.alignment = PP_ALIGN.CENTER

        pbox = slide.shapes.add_textbox(Inches(10.5), Inches(7.05), Inches(2.0), Inches(0.35))
        ptf = pbox.text_frame
        pp = ptf.paragraphs[0]
        pp.text = f"Slide {current_page} of {total_pages}"
        pp.font.size = Pt(9.5)
        pp.font.color.rgb = TEXT_MUTED
        pp.alignment = PP_ALIGN.RIGHT

    def create_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER, border_width=1.5):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        shape.line.color.rgb = border_color
        shape.line.width = Pt(border_width)
        return shape

    # =========================================================================
    # SLIDE 1: Normal Hackathon Title Slide (By Kaushal)
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)

    # Top Tag
    t_tag = create_card(s1, Inches(0.8), Inches(0.5), Inches(3.2), Inches(0.38), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=1.5)
    ttf = t_tag.text_frame
    tp = ttf.paragraphs[0]
    tp.text = "🚀 HACKATHON PROJECT SHOWCASE"
    tp.font.size = Pt(10)
    tp.font.bold = True
    tp.font.color.rgb = TEAL
    tp.alignment = PP_ALIGN.CENTER

    # Project Title
    title_box = s1.shapes.add_textbox(Inches(0.8), Inches(1.0), Inches(11.733), Inches(1.4))
    tf = title_box.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "EduSync"
    p1.font.size = Pt(52)
    p1.font.bold = True
    p1.font.color.rgb = NAVY

    p2 = tf.add_paragraph()
    p2.text = "Offline-First Learning Platform · Zero Data Loss on Patchy Networks"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = BLUE
    p2.space_before = Pt(4)

    # Presenter Card
    by_box = s1.shapes.add_textbox(Inches(0.8), Inches(2.45), Inches(11.733), Inches(0.45))
    by_tf = by_box.text_frame
    byp = by_tf.paragraphs[0]
    byp.text = "👤 Presented by: Kaushal   |   Theme: Education Technology & Distributed Systems"
    byp.font.size = Pt(13)
    byp.font.bold = True
    byp.font.color.rgb = TEXT_DARK

    # Big Live Deployment Callout Banner
    live_banner = create_card(s1, Inches(0.8), Inches(3.0), Inches(11.733), Inches(0.85), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=2)
    ltf = live_banner.text_frame
    ltf.word_wrap = True
    ltf.margin_top = Inches(0.12)
    lp = ltf.paragraphs[0]
    lp.text = "🌐 LIVE WORKING DEPLOYMENT: https://edusync-tus.pages.dev/"
    lp.font.size = Pt(16)
    lp.font.bold = True
    lp.font.color.rgb = TEAL
    lp.alignment = PP_ALIGN.CENTER
    lp2 = ltf.add_paragraph()
    lp2.text = "Open on your phone right now, turn on Airplane Mode, read lessons, and submit answers with zero internet!"
    lp2.font.size = Pt(11)
    lp2.font.color.rgb = TEXT_DARK
    lp2.alignment = PP_ALIGN.CENTER

    # Value Proposition Card
    vp_card = create_card(s1, Inches(0.8), Inches(4.05), Inches(11.733), Inches(1.3), bg_color=WHITE, border_color=CARD_BORDER, border_width=1.5)
    vptf = vp_card.text_frame
    vptf.word_wrap = True
    vptf.margin_top = Inches(0.15)
    vptf.margin_left = vptf.margin_right = Inches(0.25)
    
    vp1 = vptf.paragraphs[0]
    vp1.text = "💡 THE CORE IDEA IN SIMPLE WORDS:"
    vp1.font.size = Pt(12)
    vp1.font.bold = True
    vp1.font.color.rgb = AMBER

    vp2 = vptf.add_paragraph()
    vp2.text = "\"Your phone is your digital notebook. The internet is just the mailman.\""
    vp2.font.size = Pt(16)
    vp2.font.bold = True
    vp2.font.color.rgb = NAVY
    vp2.space_before = Pt(2)

    vp3 = vptf.add_paragraph()
    vp3.text = "• Like WhatsApp for school: You can study, write essays, and submit exams with 0 internet. Work delivers automatically the second signal returns."
    vp3.font.size = Pt(11.5)
    vp3.font.color.rgb = TEXT_MUTED
    vp3.space_before = Pt(4)

    # 4 Quick Stat Tiles across bottom
    st_w = Inches(2.7)
    st_gap = Inches(0.31)
    st_y = Inches(5.5)
    st_h = Inches(1.3)

    stats = [
        ("⚡ 0 ms", "Offline Latency", "Instant local writes in IndexedDB", BLUE, BLUE_LIGHT),
        ("💾 0 Words Lost", "Crash-Proof", "Survives dead batteries (Kill Test)", TEAL, TEAL_LIGHT),
        ("🛡️ 0 Duplicates", "Idempotent Submit", "Spam clicks safely absorbed", PURPLE, PURPLE_LIGHT),
        ("♿ WCAG 2.2 AA", "Accessible for All", "Screen readers & 7:1+ contrast", AMBER, AMBER_LIGHT),
    ]

    for i, (num, label, desc, col, bg) in enumerate(stats):
        sc = create_card(s1, Inches(0.8) + (st_w + st_gap)*i, st_y, st_w, st_h, bg_color=bg, border_color=col, border_width=1.5)
        stf = sc.text_frame
        stf.word_wrap = True
        stf.margin_top = Inches(0.14)
        stf.margin_left = Inches(0.15)

        p = stf.paragraphs[0]
        p.text = num
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = col

        sp1 = stf.add_paragraph()
        sp1.text = label
        sp1.font.size = Pt(11)
        sp1.font.bold = True
        sp1.font.color.rgb = NAVY
        sp1.space_before = Pt(2)

        sp2 = stf.add_paragraph()
        sp2.text = desc
        sp2.font.size = Pt(9.5)
        sp2.font.color.rgb = TEXT_MUTED
        sp2.space_before = Pt(2)

    add_footer(s1, 1)

    # =========================================================================
    # SLIDE 2: Problem Statement & Real-World Pain
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_header(s2, "The Real-World Problem: Why Traditional Apps Fail")

    w3 = Inches(3.72)
    gap3 = Inches(0.28)
    top2 = Inches(1.5)
    h2 = Inches(5.3)

    prob_cards = [
        {
            "icon": "🚌",
            "title": "The Bus Ride Reality",
            "color": ROSE,
            "bg": RGBColor(255, 241, 242),
            "points": [
                ("Commute Signal Drops", "Students commuting on buses or trains face constant signal blackouts."),
                ("Fake Online Status", "Browsers claim 'online' even behind dead captive portals with zero data flow."),
                ("Frozen Loading Spinners", "Traditional school apps freeze for 30s timeouts, locking students out of their notes."),
                ("Blocked Homework Access", "Students cannot open instructions or study rubrics once disconnected.")
            ]
        },
        {
            "icon": "💥",
            "title": "Devastating Exam Wipeouts",
            "color": AMBER,
            "bg": AMBER_LIGHT,
            "points": [
                ("The Disappearing Essay", "A student writes 500 words, clicks Submit in a dead zone, and the page refreshes to blank."),
                ("Duplicate Submissions", "Panicked students spam Submit 10 times, causing duplicate entries or spam blocks."),
                ("Silent Overwrites", "Naive Last-Write-Wins wipes simultaneous offline edits with zero warning."),
                ("Student Anxiety & Loss of Trust", "Fear of lost work causes immense stress during digital exam submissions.")
            ]
        },
        {
            "icon": "💡",
            "title": "How EduSync Fixes This",
            "color": TEAL,
            "bg": TEAL_LIGHT,
            "points": [
                ("Instant 0ms Local Save", "Every keystroke commits immediately to phone storage before touching the wire."),
                ("Pre-Cached Courses", "Textbooks and lesson videos open instantly with zero internet required."),
                ("Instant Confirmed Receipts", "Students receive an official submission receipt right on their screen."),
                ("Gentle Wi-Fi Reconnect", "Background delta queue delivers work automatically when signal returns.")
            ]
        }
    ]

    for i, cdata in enumerate(prob_cards):
        cx = Inches(0.8) + (w3 + gap3)*i
        card = create_card(s2, cx, top2, w3, h2, border_color=cdata["color"], border_width=2)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.2)
        tf.margin_left = tf.margin_right = Inches(0.22)

        p = tf.paragraphs[0]
        p.text = f"{cdata['icon']} {cdata['title']}"
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = cdata["color"]

        for btitle, bdesc in cdata["points"]:
            bp = tf.add_paragraph()
            bp.text = f"• {btitle}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = NAVY
            bp.space_before = Pt(10)
            r = bp.add_run()
            r.text = bdesc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    add_footer(s2, 2)

    # =========================================================================
    # SLIDE 3: Visual Pipeline Diagram (EMBEDDED 3D IMAGE 1)
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_header(s3, "The Data Synchronization Pipeline (Visual Flowchart)", category="DATA PIPELINE")

    pipe_img = 'assets/pipeline-3d.jpg' if os.path.exists('assets/pipeline-3d.jpg') else 'assets/pipeline-diagram.png'
    if os.path.exists(pipe_img):
        s3.shapes.add_picture(pipe_img, Inches(1.566), Inches(1.22), width=Inches(10.2))

    add_footer(s3, 3, 10)

    # =========================================================================
    # SLIDE 4: System Architecture Diagram (EMBEDDED IMAGE 2)
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_header(s4, "System Architecture: End-to-End Layers (Visual Diagram)", category="SYSTEM ARCHITECTURE")

    arch_img = 'assets/architecture-diagram.png'
    if os.path.exists(arch_img):
        s4.shapes.add_picture(arch_img, Inches(1.566), Inches(1.22), width=Inches(10.2))

    add_footer(s4, 4, 10)

    # =========================================================================
    # SLIDE 5: The Conflict Resolution Ladder (EMBEDDED 3D IMAGE 3)
    # =========================================================================
    s5_ladder = prs.slides.add_slide(blank_layout)
    add_header(s5_ladder, "Conflict Resolution Ladder: Smart Merging & Zero Data Loss", category="MULTI-DEVICE CONFLICT RESOLUTION")

    ladder_img = 'assets/conflict-ladder-3d.jpg'
    if os.path.exists(ladder_img):
        s5_ladder.shapes.add_picture(ladder_img, Inches(1.566), Inches(1.22), width=Inches(10.2))

    add_footer(s5_ladder, 5, 10)

    # =========================================================================
    # SLIDE 6: How Our Project Looks — Course Library & Offline Writing
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_header(s5, "How Our Project Looks: Offline Library & Writing", category="REAL-WORLD UI WALKTHROUGH")

    top5 = Inches(1.45)
    shot_w = Inches(5.7)
    shot_gap = Inches(0.33)

    # Left: Course Library
    s5.shapes.add_picture('docs/shots/02-library.png', Inches(0.8), top5, width=shot_w)
    c_lib = create_card(s5, Inches(0.8), top5 + Inches(3.6), shot_w, Inches(1.85), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=1.5)
    ltf = c_lib.text_frame
    ltf.word_wrap = True
    ltf.margin_top = Inches(0.15)
    ltf.margin_left = ltf.margin_right = Inches(0.2)
    
    lp = ltf.paragraphs[0]
    lp.text = "📚 1. Course Library (Pre-Cached Offline)"
    lp.font.size = Pt(13.5)
    lp.font.bold = True
    lp.font.color.rgb = TEAL

    l_pts = [
        ("Green Badges", "Every lesson topic clearly displays 'Available offline'."),
        ("0ms Instant Reading", "Textbooks and lesson rubrics open in 0ms with zero loading spinners."),
        ("Read Anywhere", "Students can read all 6 lessons on a bus with ZERO internet.")
    ]
    for btitle, bdesc in l_pts:
        bp = ltf.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = NAVY
        bp.space_before = Pt(3)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right: Assignment Workspace Submitted Offline
    rx = Inches(0.8) + shot_w + shot_gap
    s5.shapes.add_picture('docs/shots/04-assignment-offline.png', rx, top5, width=shot_w)
    c_asgn = create_card(s5, rx, top5 + Inches(3.6), shot_w, Inches(1.85), bg_color=BLUE_LIGHT, border_color=BLUE, border_width=1.5)
    rtf = c_asgn.text_frame
    rtf.word_wrap = True
    rtf.margin_top = Inches(0.15)
    rtf.margin_left = rtf.margin_right = Inches(0.2)

    rp = rtf.paragraphs[0]
    rp.text = "✍️ 2. Assignment Workspace (Submitted Offline)"
    rp.font.size = Pt(13.5)
    rp.font.bold = True
    rp.font.color.rgb = BLUE

    r_pts = [
        ("Offline Submit", "Student submits worksheet with Wi-Fi turned off completely."),
        ("Instant Receipt", "Green 'Submitted · confirmed' badge and receipt card appear in 0ms."),
        ("Kill Test Verified", "Closing the tab or battery dying loses ZERO words upon reopening.")
    ]
    for btitle, bdesc in r_pts:
        bp = rtf.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = NAVY
        bp.space_before = Pt(3)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_footer(s5, 6, 10)

    # =========================================================================
    # SLIDE 7: How Our Project Looks — Sync Center & Conflict Diff
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_header(s6, "How Our Project Looks: Sync Center & Conflict Diff", category="REAL-WORLD UI WALKTHROUGH")

    # Left: Sync Center with connection simulator
    s6.shapes.add_picture('docs/shots/06-sync-center-queued.png', Inches(0.8), top5, width=shot_w)
    c_sync = create_card(s6, Inches(0.8), top5 + Inches(3.6), shot_w, Inches(1.85), bg_color=AMBER_LIGHT, border_color=AMBER, border_width=1.5)
    stf = c_sync.text_frame
    stf.word_wrap = True
    stf.margin_top = Inches(0.15)
    stf.margin_left = stf.margin_right = Inches(0.2)

    sp = stf.paragraphs[0]
    sp.text = "🔄 3. Sync Center (Live Connection Simulator)"
    sp.font.size = Pt(13.5)
    sp.font.bold = True
    sp.font.color.rgb = AMBER

    s_pts = [
        ("Interactive Testing", "Judges can flip the 'Simulate offline' switch live to test drops."),
        ("Queued Changes", "Shows edits waiting safely on device memory without freezing."),
        ("Automatic Flush", "Flushes queue in background as soon as network is switched on.")
    ]
    for btitle, bdesc in s_pts:
        bp = stf.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = NAVY
        bp.space_before = Pt(3)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right: Review Inbox Diff Screen
    s6.shapes.add_picture('docs/shots/08-review-inbox.png', rx, top5, width=shot_w)
    c_rev = create_card(s6, rx, top5 + Inches(3.6), shot_w, Inches(1.85), bg_color=PURPLE_LIGHT, border_color=PURPLE, border_width=1.5)
    rvtf = c_rev.text_frame
    rvtf.word_wrap = True
    rvtf.margin_top = Inches(0.15)
    rvtf.margin_left = rvtf.margin_right = Inches(0.2)

    rp = rvtf.paragraphs[0]
    rp.text = "👥 4. Review Inbox (Side-by-Side Conflict Diff)"
    rp.font.size = Pt(13.5)
    rp.font.bold = True
    rp.font.color.rgb = PURPLE

    rv_pts = [
        ("Side-by-Side Diff", "Visual diff highlights exact differences between local draft & server."),
        ("Student Decides", "Students choose: 'Keep Mine', 'Accept Peer's', or 'Combine Both'."),
        ("Zero Overwrites", "Eliminates silent data clobbering in group projects.")
    ]
    for btitle, bdesc in rv_pts:
        bp = rvtf.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = NAVY
        bp.space_before = Pt(3)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_footer(s6, 7, 10)

    # =========================================================================
    # SLIDE 7: Simplified Tech Stack (Plain-English with Icons)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "The Tech Stack: What We Used & Why (In Plain Words)")

    w4 = Inches(2.74)
    gap4 = Inches(0.25)
    top7 = Inches(1.5)
    h7 = Inches(5.3)

    simple_tech_cards = [
        {
            "icon": "📱",
            "tag": "FRONTEND SCREEN",
            "tag_col": BLUE,
            "title": "React 18 & Vite",
            "what": "The buttons, forms, and pages the student touches.",
            "why": [
                ("0ms Response", "Updates instantly as you type; no spinning wheels."),
                ("TypeScript Safety", "Catches code bugs before reaching students."),
                ("Super-Lightweight", "Loads in <1s even on budget $50 smartphones.")
            ]
        },
        {
            "icon": "💾",
            "tag": "DEVICE STORAGE",
            "tag_col": TEAL,
            "title": "IndexedDB & SW",
            "what": "A private, tamper-proof storage box right inside the browser.",
            "why": [
                ("Survives Phone Crashes", "Saved on phone disk; survives reboots and dead batteries."),
                ("Service Worker Shell", "Keeps textbooks offline so books open with 0 internet."),
                ("Immutable Log", "Every keystroke recorded like a permanent paper diary.")
            ]
        },
        {
            "icon": "☁️",
            "tag": "GLOBAL CLOUD",
            "tag_col": PURPLE,
            "title": "Cloudflare D1 & Fastify",
            "what": "The fast server and database running in 300+ cities globally.",
            "why": [
                ("300+ Edge Nodes", "Near students anywhere in the world for ultra-fast speed."),
                ("Duplicate Shield", "Absorbs repeated clicks so students are never submitted twice."),
                ("Incremental Sync", "Only sends the new words you typed, saving mobile cellular data.")
            ]
        },
        {
            "icon": "🛡️",
            "tag": "QUALITY & AUDIT",
            "tag_col": AMBER,
            "title": "Vitest & axe-core",
            "what": "Automated robot testers that verify the system never breaks.",
            "why": [
                ("108 Automated Tests", "108 automated checks test every network drop & crash."),
                ("WCAG 2.2 AA Verified", "Audited to ensure visually impaired students have full access."),
                ("Zero Guesswork", "Every single invariant is proven with automated test code.")
            ]
        }
    ]

    for i, tdata in enumerate(simple_tech_cards):
        cx = Inches(0.8) + (w4 + gap4)*i
        c = create_card(s7, cx, top7, w4, h7, border_color=tdata["tag_col"], border_width=1.5)
        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.18)
        tf.margin_left = tf.margin_right = Inches(0.2)

        p = tf.paragraphs[0]
        p.text = f"{tdata['icon']} {tdata['title']}"
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = NAVY

        p_tag = tf.add_paragraph()
        p_tag.text = tdata["tag"]
        p_tag.font.size = Pt(9.5)
        p_tag.font.bold = True
        p_tag.font.color.rgb = tdata["tag_col"]
        p_tag.space_before = Pt(2)

        wp = tf.add_paragraph()
        wp.text = tdata["what"]
        wp.font.size = Pt(10)
        wp.font.italic = True
        wp.font.color.rgb = TEXT_DARK
        wp.space_before = Pt(6)

        for w_title, w_desc in tdata["why"]:
            bp = tf.add_paragraph()
            bp.text = f"• {w_title}: "
            bp.font.bold = True
            bp.font.size = Pt(10.5)
            bp.font.color.rgb = NAVY
            bp.space_before = Pt(8)
            r = bp.add_run()
            r.text = w_desc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    add_footer(s7, 8, 10)

    # =========================================================================
    # SLIDE 9: Inclusivity, Verification & Live Links for Judges
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "Inclusivity, Verification & Live Project Links", category="EVIDENCE & VERIFICATION")

    left_w8 = Inches(6.0)
    top8 = Inches(1.5)
    c8 = create_card(s8, Inches(0.8), top8, left_w8, Inches(5.3), bg_color=WHITE, border_color=CARD_BORDER, border_width=1.5)
    tf8 = c8.text_frame
    tf8.word_wrap = True
    tf8.margin_top = Inches(0.2)
    tf8.margin_left = tf8.margin_right = Inches(0.25)

    p8 = tf8.paragraphs[0]
    p8.text = "♿ BUILT FOR EVERY STUDENT (WCAG 2.2 AA)"
    p8.font.size = Pt(13)
    p8.font.bold = True
    p8.font.color.rgb = TEAL

    acc_points = [
        ("Screen Reader Friendly", "Blind and visually impaired students hear live audio announcements whenever network state changes ('You are offline', 'Syncing your work', 'Successfully saved')."),
        ("Sunlight-Readable Contrast", "High-contrast text (7:1 ratio) exceeds international accessibility standards. It stays 100% readable even on cheap phone screens in blazing bright sunlight."),
        ("100% Keyboard Usable", "Students with motor impairments can navigate every single page and submit work using only Tab, Shift+Tab, and Enter keys."),
        ("108 Automated Tests Passing", "Every single edge case, simulated network drop, and crash scenario was verified automatically across the monorepo.")
    ]

    for title, desc in acc_points:
        bp = tf8.add_paragraph()
        bp.text = f"• {title}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = NAVY
        bp.space_before = Pt(10)
        r = bp.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right Column: Big Prominent Links for Judges
    right_w8 = Inches(5.45)
    rx8 = Inches(7.08)

    # Live URL Box
    c_live = create_card(s8, rx8, top8, right_w8, Inches(1.6), bg_color=BLUE_LIGHT, border_color=BLUE, border_width=2)
    ltf = c_live.text_frame
    ltf.word_wrap = True
    ltf.margin_top = Inches(0.15)
    ltf.margin_left = ltf.margin_right = Inches(0.2)
    lp = ltf.paragraphs[0]
    lp.text = "🌐 Live Cloudflare Web App"
    lp.font.size = Pt(14)
    lp.font.bold = True
    lp.font.color.rgb = BLUE
    lp2 = ltf.add_paragraph()
    lp2.text = "https://edusync-tus.pages.dev/\nTry it right now: Open on your smartphone, turn on Airplane mode, read a lesson, and submit an answer. Watch it issue an official receipt with zero network!"
    lp2.font.size = Pt(10.5)
    lp2.font.color.rgb = TEXT_DARK
    lp2.space_before = Pt(4)

    # Demo Video Box
    c_vid = create_card(s8, rx8, top8 + Inches(1.75), right_w8, Inches(1.5), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=2)
    vtf = c_vid.text_frame
    vtf.word_wrap = True
    vtf.margin_top = Inches(0.15)
    vtf.margin_left = vtf.margin_right = Inches(0.2)
    vp = vtf.paragraphs[0]
    vp.text = "🎬 2-Minute Screen-Recorded Video"
    vp.font.size = Pt(14)
    vp.font.bold = True
    vp.font.color.rgb = TEAL
    vp2 = vtf.add_paragraph()
    vp2.text = "assets/EduSync-Demo.mp4 (in GitHub repository)\nClean silent screen capture with custom animated cursor and step-by-step caption HUD explaining each offline invariant."
    vp2.font.size = Pt(10.5)
    vp2.font.color.rgb = TEXT_DARK
    vp2.space_before = Pt(4)

    # GitHub Repository Box
    c_git = create_card(s8, rx8, top8 + Inches(3.4), right_w8, Inches(1.9), bg_color=AMBER_LIGHT, border_color=AMBER, border_width=2)
    gtf = c_git.text_frame
    gtf.word_wrap = True
    gtf.margin_top = Inches(0.15)
    gtf.margin_left = gtf.margin_right = Inches(0.2)
    gp = gtf.paragraphs[0]
    gp.text = "📦 Open-Source Codebase & Tests"
    gp.font.size = Pt(14)
    gp.font.bold = True
    gp.font.color.rgb = AMBER
    gp2 = gtf.add_paragraph()
    gp2.text = "https://github.com/blank-0007/edusync\n• 108/108 automated tests passing across 3 workspaces.\n• Complete reproduction: npm run dev, npm test, bash scripts/verify.sh.\n• Includes PDF proposal, presentations, and design docs."
    gp2.font.size = Pt(10.5)
    gp2.font.color.rgb = TEXT_DARK
    gp2.space_before = Pt(4)

    add_footer(s8, 9, 10)

    # =========================================================================
    # SLIDE 10: Conclusion & Summary (Kaushal)
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    add_header(s9, "Conclusion & Summary: Education for Everyone", category="IMPACT & SUMMARY")

    # Big Center Banner
    banner_c = create_card(s9, Inches(0.8), Inches(1.5), Inches(11.733), Inches(1.3), bg_color=TEAL_LIGHT, border_color=TEAL, border_width=2)
    btf = banner_c.text_frame
    btf.word_wrap = True
    btf.margin_top = Inches(0.2)
    bp = btf.paragraphs[0]
    bp.text = "THE BOTTOM LINE FOR STUDENTS WORLDWIDE"
    bp.font.size = Pt(12)
    bp.font.bold = True
    bp.font.color.rgb = TEAL
    bp.alignment = PP_ALIGN.CENTER
    bp2 = btf.add_paragraph()
    bp2.text = "\"A student's internet connection should never decide whether they pass or fail.\""
    bp2.font.size = Pt(20)
    bp2.font.bold = True
    bp2.font.color.rgb = NAVY
    bp2.alignment = PP_ALIGN.CENTER
    bp2.space_before = Pt(4)

    # 3 Summary Cards
    top9 = Inches(3.0)
    w9 = Inches(3.68)
    gap9 = Inches(0.34)
    h9 = Inches(2.6)

    final_cards = [
        ("Write Anywhere, Worry About Nothing", TEAL, [
            ("Every keystroke saved locally", "Zero waiting for servers."),
            ("100% Crash-Proof", "Survives dead batteries & browser kills."),
            ("Zero Disconnect Lockouts", "Full access to lessons & rubrics.")
        ]),
        ("Clean, Smart & Truthful Delivery", BLUE, [
            ("No Duplicate Submissions", "Unique attempt IDs absorb retry spam."),
            ("Gentle on School Wi-Fi", "Jittered backoff prevents server crashes."),
            ("Effortless Group Teamwork", "Yjs CRDTs blend offline edits safely.")
        ]),
        ("Ready Today, Proven with Tests", AMBER, [
            ("108/108 Tests Passing", "Every single edge case verified."),
            ("WCAG 2.2 AA Inclusivity", "High-contrast & screen reader friendly."),
            ("Live on Cloudflare Pages", "Deployed worldwide at edusync-tus.pages.dev.")
        ])
    ]

    for i, (rtitle, rcolor, rbullets) in enumerate(final_cards):
        cx = Inches(0.8) + (w9 + gap9)*i
        c = create_card(s9, cx, top9, w9, h9, border_color=rcolor, border_width=1.5)
        tf = c.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.2)
        tf.margin_left = tf.margin_right = Inches(0.2)

        p = tf.paragraphs[0]
        p.text = rtitle
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = rcolor

        for b_title, b_desc in rbullets:
            bp = tf.add_paragraph()
            bp.text = f"• {b_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = NAVY
            bp.space_before = Pt(8)
            r = bp.add_run()
            r.text = b_desc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    # Bottom Thank You & Q&A Box with Kaushal's name
    qbox = s9.shapes.add_textbox(Inches(0.8), Inches(5.85), Inches(11.733), Inches(0.9))
    qtf = qbox.text_frame
    qp = qtf.paragraphs[0]
    qp.text = "THANK YOU! WE ARE EXCITED TO ANSWER YOUR QUESTIONS"
    qp.font.size = Pt(18)
    qp.font.bold = True
    qp.font.color.rgb = NAVY
    qp.alignment = PP_ALIGN.CENTER
    qp2 = qtf.add_paragraph()
    qp2.text = "EduSync · Created by Kaushal   |   Live App: edusync-tus.pages.dev   |   Repository: github.com/blank-0007/edusync"
    qp2.font.size = Pt(12)
    qp2.font.bold = True
    qp2.font.color.rgb = TEAL
    qp2.alignment = PP_ALIGN.CENTER
    qp2.space_before = Pt(4)

    add_footer(s9, 10, 10)

    prs.save(output_path)
    print(f"✅ Full Hackathon PowerPoint saved to {output_path}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "EduSync-Presentation.pptx"
    build_hackathon_presentation(out)
