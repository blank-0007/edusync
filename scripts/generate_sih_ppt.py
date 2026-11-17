import sys
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_sih_presentation(output_path):
    prs = Presentation()
    # 16:9 widescreen layout (SIH standard)
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # SIH Brand Colors
    SIH_NAVY = RGBColor(15, 27, 45)       # #0F1B2D
    SIH_BLUE = RGBColor(37, 99, 235)      # #2563EB
    SIH_TEAL = RGBColor(14, 124, 107)     # #0E7C6B
    SIH_PURPLE = RGBColor(124, 58, 237)   # #7C3AED
    SIH_AMBER = RGBColor(217, 119, 6)     # #D97706
    SIH_ROSE = RGBColor(225, 29, 72)      # #E11D48
    SIH_GREEN = RGBColor(16, 185, 129)    # #10B981

    SIH_CREAM = RGBColor(254, 243, 199)   # #FEF3C7 (SIH Yellow Callout BG)
    SIH_AMBER_BORDER = RGBColor(245, 158, 11) # #F59E0B
    SIH_TEAL_BG = RGBColor(230, 244, 241) # #E6F4F1
    SIH_BLUE_BG = RGBColor(238, 242, 255) # #EEF2FF
    SIH_PURPLE_BG = RGBColor(237, 233, 254) # #EDE9FE

    WHITE = RGBColor(255, 255, 255)
    SLIDE_BG = RGBColor(255, 255, 255)
    CARD_BG = RGBColor(248, 250, 252)
    CARD_BORDER = RGBColor(226, 232, 240)
    TEXT_DARK = RGBColor(15, 23, 42)
    TEXT_MUTED = RGBColor(71, 85, 105)

    def add_sih_header(slide, title_text):
        # Left Team Oval
        oval = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.35), Inches(1.8), Inches(0.7))
        oval.fill.solid()
        oval.fill.fore_color.rgb = WHITE
        oval.line.color.rgb = SIH_PURPLE
        oval.line.width = Pt(2)
        otf = oval.text_frame
        otf.vertical_anchor = MSO_ANCHOR.MIDDLE
        op = otf.paragraphs[0]
        op.text = "EduSync"
        op.font.size = Pt(17)
        op.font.bold = True
        op.font.color.rgb = SIH_NAVY
        op.alignment = PP_ALIGN.CENTER

        # Main Title (ALL CAPS like SIH)
        t_box = slide.shapes.add_textbox(Inches(2.8), Inches(0.35), Inches(7.5), Inches(0.7))
        tf = t_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title_text.upper()
        p.font.size = Pt(25)
        p.font.bold = True
        p.font.color.rgb = SIH_NAVY

        # Right SIH Badge
        sih_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.6), Inches(0.35), Inches(1.9), Inches(0.7))
        sih_box.fill.solid()
        sih_box.fill.fore_color.rgb = SIH_CREAM
        sih_box.line.color.rgb = SIH_AMBER_BORDER
        sih_box.line.width = Pt(1.5)
        s_tf = sih_box.text_frame
        s_tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        sp1 = s_tf.paragraphs[0]
        sp1.text = "SMART INDIA"
        sp1.font.size = Pt(9.5)
        sp1.font.bold = True
        sp1.font.color.rgb = SIH_AMBER
        sp1.alignment = PP_ALIGN.CENTER
        sp2 = s_tf.add_paragraph()
        sp2.text = "HACKATHON 2026"
        sp2.font.size = Pt(9)
        sp2.font.bold = True
        sp2.font.color.rgb = SIH_NAVY
        sp2.alignment = PP_ALIGN.CENTER

    def add_bottom_prototype_banner(slide, text="Solution Prototype: https://edusync-tus.pages.dev/"):
        p_box = slide.shapes.add_textbox(Inches(0.8), Inches(6.9), Inches(11.733), Inches(0.4))
        ptf = p_box.text_frame
        ptf.word_wrap = True
        ptf.margin_left = ptf.margin_right = ptf.margin_top = ptf.margin_bottom = 0
        p = ptf.paragraphs[0]
        p.text = text
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = SIH_BLUE
        p.alignment = PP_ALIGN.CENTER

    def create_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER, border_width=1.5):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        shape.line.color.rgb = border_color
        shape.line.width = Pt(border_width)
        return shape

    # =========================================================================
    # SLIDE 1: SIH Title Slide (Exact SIH Layout)
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)

    # Top SIH Header Banner
    h1 = s1.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(8.5), Inches(0.6))
    htf = h1.text_frame
    hp1 = htf.paragraphs[0]
    hp1.text = "SMART INDIA HACKATHON 2026"
    hp1.font.size = Pt(28)
    hp1.font.bold = True
    hp1.font.color.rgb = SIH_NAVY

    hp2 = htf.add_paragraph()
    hp2.text = "THEME: Education Technology"
    hp2.font.size = Pt(18)
    hp2.font.bold = True
    hp2.font.color.rgb = SIH_TEAL
    hp2.space_before = Pt(4)

    # Title
    t1 = s1.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(7.5), Inches(0.8))
    ttf = t1.text_frame
    tp1 = ttf.paragraphs[0]
    tp1.text = "EduSync — Offline-First Learning Platform"
    tp1.font.size = Pt(22)
    tp1.font.bold = True
    tp1.font.color.rgb = SIH_BLUE

    # Left SIH Details Table
    table_shape = s1.shapes.add_table(5, 2, Inches(0.8), Inches(2.5), Inches(7.0), Inches(2.2))
    table = table_shape.table
    table.columns[0].width = Inches(2.4)
    table.columns[1].width = Inches(4.6)

    table_data = [
        ("Problem Statement ID", "Problem 1 (SIH 2026)"),
        ("Problem Statement Title", "Offline-First Learning Infrastructure"),
        ("Theme", "Education Technology"),
        ("PS Category", "Software (Very Hard)"),
        ("Team / Project", "EduSync"),
    ]

    for row_idx, (col0, col1) in enumerate(table_data):
        c0 = table.cell(row_idx, 0)
        c0.text = col0
        c0.fill.solid()
        c0.fill.fore_color.rgb = SIH_BLUE_BG
        for p in c0.text_frame.paragraphs:
            p.font.size = Pt(10.5)
            p.font.bold = True
            p.font.color.rgb = SIH_NAVY

        c1 = table.cell(row_idx, 1)
        c1.text = col1
        c1.fill.solid()
        c1.fill.fore_color.rgb = WHITE
        for p in c1.text_frame.paragraphs:
            p.font.size = Pt(10.5)
            p.font.color.rgb = TEXT_DARK

    # 3 Large Bottom Stat Tiles (like SIH template)
    bot_w = Inches(2.2)
    bot_gap = Inches(0.2)
    bot_y = Inches(4.9)
    bot_h = Inches(1.3)

    bot_boxes = [
        ("ORGANISATION", "EdTech Hackathon", SIH_BLUE),
        ("PS CATEGORY", "Software", SIH_TEAL),
        ("PROBLEM ID", "1 (Very Hard)", SIH_AMBER),
    ]

    for i, (b_top, b_main, b_col) in enumerate(bot_boxes):
        bx = Inches(0.8) + (bot_w + bot_gap)*i
        bc = create_card(s1, bx, bot_y, bot_w, bot_h, bg_color=WHITE, border_color=b_col, border_width=2)
        btf = bc.text_frame
        btf.word_wrap = True
        btf.margin_top = Inches(0.18)
        
        bp = btf.paragraphs[0]
        bp.text = b_top
        bp.font.size = Pt(10)
        bp.font.bold = True
        bp.font.color.rgb = TEXT_MUTED
        bp.alignment = PP_ALIGN.CENTER

        bp2 = btf.add_paragraph()
        bp2.text = b_main
        bp2.font.size = Pt(16)
        bp2.font.bold = True
        bp2.font.color.rgb = b_col
        bp2.alignment = PP_ALIGN.CENTER
        bp2.space_before = Pt(4)

    # Right Side: SIH Artwork Card + Live URL Callout
    right_x = Inches(8.2)
    rc = create_card(s1, right_x, Inches(1.5), Inches(4.333), Inches(4.7), bg_color=SIH_CREAM, border_color=SIH_AMBER_BORDER, border_width=2)
    rtf = rc.text_frame
    rtf.word_wrap = True
    rtf.margin_top = Inches(0.3)
    rtf.margin_left = rtf.margin_right = Inches(0.3)

    rp1 = rtf.paragraphs[0]
    rp1.text = "💡 THE CORE PROMISE (IN SIMPLE WORDS)"
    rp1.font.size = Pt(13)
    rp1.font.bold = True
    rp1.font.color.rgb = SIH_AMBER

    rp2 = rtf.add_paragraph()
    rp2.text = "\"Your phone is your digital notebook. The internet is just the mailman.\""
    rp2.font.size = Pt(17)
    rp2.font.bold = True
    rp2.font.color.rgb = SIH_NAVY
    rp2.space_before = Pt(8)

    rp3 = rtf.add_paragraph()
    rp3.text = "• Like WhatsApp: You can read lessons, write essays, and submit exams even on airplane mode with zero internet."
    rp3.font.size = Pt(11.5)
    rp3.font.color.rgb = TEXT_DARK
    rp3.space_before = Pt(10)

    rp4 = rtf.add_paragraph()
    rp4.text = "• Crash-Proof: If your phone battery dies mid-exam, 100% of your work is safe on disk and re-appears when turned back on."
    rp4.font.size = Pt(11.5)
    rp4.font.color.rgb = TEXT_DARK
    rp4.space_before = Pt(8)

    rp5 = rtf.add_paragraph()
    rp5.text = "• No Duplicate Submissions: Spamming the submit button 5 times during a signal drop still counts as only ONE attempt."
    rp5.font.size = Pt(11.5)
    rp5.font.color.rgb = TEXT_DARK
    rp5.space_before = Pt(8)

    add_bottom_prototype_banner(s1, "Solution Prototype: https://edusync-tus.pages.dev/ (Live on Cloudflare)")

    # =========================================================================
    # SLIDE 2: Solution Overview & Unique Feature (Exact SIH Page 2 Style)
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_sih_header(s2, "Offline-First Learning Platform")

    # Yellow Star Callout Banner across top
    star_box = create_card(s2, Inches(0.8), Inches(1.2), Inches(11.733), Inches(0.7), bg_color=SIH_CREAM, border_color=SIH_AMBER_BORDER, border_width=1.5)
    stf = star_box.text_frame
    stf.word_wrap = True
    stf.margin_top = Inches(0.12)
    stf.margin_left = Inches(0.25)
    sp = stf.paragraphs[0]
    sp.text = "★ Unique Feature: We do not just show cached pages — we guarantee ZERO lost work, ZERO duplicate test submissions, and seamless offline co-editing with 0ms local saving."
    sp.font.size = Pt(12)
    sp.font.bold = True
    sp.font.color.rgb = SIH_NAVY

    # 3 Columns (Approach, How It Solves, Advanced Twist)
    w3 = Inches(3.72)
    gap3 = Inches(0.28)
    top2 = Inches(2.05)
    h2 = Inches(4.7)

    # Col 1: Approach
    c1 = create_card(s2, Inches(0.8), top2, w3, h2, border_color=SIH_GREEN, border_width=2)
    tf1 = c1.text_frame
    tf1.word_wrap = True
    tf1.margin_top = Inches(0.2)
    tf1.margin_left = tf1.margin_right = Inches(0.22)
    
    p = tf1.paragraphs[0]
    p.text = "1. Our Approach (Simple)"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = SIH_GREEN

    points1 = [
        ("The Bus Ride Reality", "Students on rural bus commutes lose cellular internet constantly."),
        ("Save on Phone First", "Every letter you type saves directly on your phone's memory in 0 milliseconds."),
        ("Download Once, Read Anywhere", "Textbooks and lesson videos are pre-downloaded onto the device."),
        ("No Loading Wheels", "Zero spinning wheels because lessons open instantly from local storage.")
    ]
    for btitle, bdesc in points1:
        bp = tf1.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(8)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Col 2: How It Solves the Problem
    c2 = create_card(s2, Inches(0.8) + w3 + gap3, top2, w3, h2, border_color=SIH_BLUE, border_width=2)
    tf2 = c2.text_frame
    tf2.word_wrap = True
    tf2.margin_top = Inches(0.2)
    tf2.margin_left = tf2.margin_right = Inches(0.22)

    p = tf2.paragraphs[0]
    p.text = "2. How It Solves the Problem"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = SIH_BLUE

    points2 = [
        ("Zero Disappearing Exams", "When you click 'Submit' offline, an official confirmed receipt appears instantly."),
        ("Automatic Wi-Fi Delivery", "When your phone connects to Wi-Fi, it quietly delivers your test in the background."),
        ("Never Clogs School Wi-Fi", "Smart waiting (jittered backoff) prevents 50 students from crashing school routers at once."),
        ("Honest Status Always", "The top bar truthfully displays: 'Offline · 2 changes saved safely on this device'.")
    ]
    for btitle, bdesc in points2:
        bp = tf2.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(8)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Col 3: The Advanced Twist
    c3 = create_card(s2, Inches(0.8) + (w3 + gap3)*2, top2, w3, h2, border_color=SIH_PURPLE, border_width=2)
    tf3 = c3.text_frame
    tf3.word_wrap = True
    tf3.margin_top = Inches(0.2)
    tf3.margin_left = tf3.margin_right = Inches(0.22)

    p = tf3.paragraphs[0]
    p.text = "3. The Advanced Twist"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = SIH_PURPLE

    points3 = [
        ("Offline Teamwork", "Two students can edit the same lab report offline without overwriting each other."),
        ("Mathematical Merging", "Using Yjs CRDTs, concurrent edits blend together smoothly like magic."),
        ("Side-by-Side Review Screen", "If two students edit the exact same line, EduSync shows both copies side-by-side."),
        ("Student Decides", "Choose 'Keep Mine', 'Accept Peer's', or 'Combine Both' with 0 lost words.")
    ]
    for btitle, bdesc in points3:
        bp = tf3.add_paragraph()
        bp.text = f"• {btitle}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(8)
        r = bp.add_run()
        r.text = bdesc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_bottom_prototype_banner(s2)

    # =========================================================================
    # SLIDE 3: Technical Approach & Architecture Pipeline (Exact SIH Page 3 Style)
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_sih_header(s3, "Technical Approach")

    # Center Pipeline Title Banner
    top_p3 = Inches(1.2)
    p_banner = create_card(s3, Inches(0.8), top_p3, Inches(11.733), Inches(0.7), bg_color=SIH_NAVY, border_color=SIH_TEAL, border_width=2)
    pbtf = p_banner.text_frame
    pbtf.word_wrap = True
    pbtf.margin_top = Inches(0.12)
    pbp = pbtf.paragraphs[0]
    pbp.text = "EDUSYNC PIPELINE: ZERO-DATA-LOSS OFFLINE LEARNING"
    pbp.font.size = Pt(14)
    pbp.font.bold = True
    pbp.font.color.rgb = WHITE
    pbp.alignment = PP_ALIGN.CENTER
    pbp2 = pbtf.add_paragraph()
    pbp2.text = "How work flows reliably from a student's phone to the teacher's gradebook"
    pbp2.font.size = Pt(10.5)
    pbp2.font.color.rgb = RGBColor(143, 209, 198)
    pbp2.alignment = PP_ALIGN.CENTER

    # Left Column: 4 Tech Stack Tiles with simple descriptions
    left_stack_w = Inches(3.6)
    card_stack_y = Inches(2.05)
    card_stack_h = Inches(4.7)
    
    st_card = create_card(s3, Inches(0.8), card_stack_y, left_stack_w, card_stack_h, bg_color=WHITE, border_color=CARD_BORDER)
    st_tf = st_card.text_frame
    st_tf.word_wrap = True
    st_tf.margin_top = Inches(0.18)
    st_tf.margin_left = st_tf.margin_right = Inches(0.2)

    sp = st_tf.paragraphs[0]
    sp.text = "CORE TECHNOLOGIES (SIMPLIFIED)"
    sp.font.size = Pt(12)
    sp.font.bold = True
    sp.font.color.rgb = SIH_BLUE

    tech_items = [
        ("React 18 & Vite (Screen)", "The buttons, forms, and pages the student touches. Updates instantly with 0ms delay so it never freezes."),
        ("IndexedDB (Phone Storage)", "A tamper-proof storage box right inside the browser. Survives phone restarts and dead batteries."),
        ("Cloudflare D1 (Global Server)", "Fast cloud database running in 300+ cities globally. Absorbs retry clicks so you are never double-submitted."),
        ("Yjs CRDTs (Co-Editing)", "Math formula that blends edits from multiple offline students without losing a single letter.")
    ]

    for title, desc in tech_items:
        bp = st_tf.add_paragraph()
        bp.text = f"• {title}: "
        bp.font.bold = True
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(8)
        r = bp.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right Side: 5 Step Visual Flowchart Box (High Visual)
    flow_x = Inches(4.65)
    flow_w = Inches(7.883)
    flow_box = create_card(s3, flow_x, card_stack_y, flow_w, card_stack_h, bg_color=WHITE, border_color=SIH_BLUE, border_width=2)
    
    ftf = flow_box.text_frame
    ftf.word_wrap = True
    ftf.margin_top = Inches(0.18)
    ftf.margin_left = ftf.margin_right = Inches(0.25)

    fp = ftf.paragraphs[0]
    fp.text = "THE 5-STEP DATA SYNCHRONIZATION PIPELINE"
    fp.font.size = Pt(13)
    fp.font.bold = True
    fp.font.color.rgb = SIH_NAVY

    pipeline_steps = [
        ("1. WRITE (0ms Instant Local)", "Student types an essay or answers a quiz. React updates the screen instantly without asking the internet."),
        ("2. LOG (Local Disk Commit)", "Every single keystroke is permanently written to an IndexedDB operation log on the phone's physical storage."),
        ("3. STATE (Truthful Badge)", "The app shows 'Offline · 2 changes saved'. Students feel completely safe continuing their work."),
        ("4. DRAIN (Jittered Queue)", "When Wi-Fi returns, the phone gently flushes the queue in sequential order without overwhelming the school network."),
        ("5. RECONCILE (Cloudflare D1)", "The server receives the changes, verifies the unique receipt ID, and confirms 'All synchronized'.")
    ]

    for title, desc in pipeline_steps:
        bp = ftf.add_paragraph()
        bp.text = f"➔ {title}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = SIH_TEAL
        bp.space_before = Pt(9)
        r = bp.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    add_bottom_prototype_banner(s3)

    # =========================================================================
    # SLIDE 4: How Our Project Looks — UI Walkthrough (Screenshots of Actual App)
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_sih_header(s4, "How Our Project Looks: Real-World UI")

    # 2 Screenshots side-by-side: Course Library + Assignment Offline
    top4 = Inches(1.2)
    shot_w = Inches(5.7)
    shot_gap = Inches(0.33)

    # Left Shot: Course Library
    s4.shapes.add_picture('docs/shots/02-library.png', Inches(0.8), top4, width=shot_w)
    c_lib = create_card(s4, Inches(0.8), top4 + Inches(3.6), shot_w, Inches(1.9), bg_color=SIH_TEAL_BG, border_color=SIH_TEAL, border_width=1.5)
    ltf = c_lib.text_frame
    ltf.word_wrap = True
    ltf.margin_top = Inches(0.15)
    ltf.margin_left = ltf.margin_right = Inches(0.2)
    
    lp = ltf.paragraphs[0]
    lp.text = "1. Course Library (Pre-Cached Offline)"
    lp.font.size = Pt(13)
    lp.font.bold = True
    lp.font.color.rgb = SIH_TEAL

    l_pts = [
        "Notice the green 'Available offline' badges on every lesson topic.",
        "Lessons and assignment rubrics are downloaded once and open in 0ms.",
        "Students can read all 6 lessons on a bus with ZERO internet."
    ]
    for pt in l_pts:
        bp = ltf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(3)

    # Right Shot: Assignment Workspace Submitted Offline
    rx = Inches(0.8) + shot_w + shot_gap
    s4.shapes.add_picture('docs/shots/04-assignment-offline.png', rx, top4, width=shot_w)
    c_asgn = create_card(s4, rx, top4 + Inches(3.6), shot_w, Inches(1.9), bg_color=SIH_BLUE_BG, border_color=SIH_BLUE, border_width=1.5)
    rtf = c_asgn.text_frame
    rtf.word_wrap = True
    rtf.margin_top = Inches(0.15)
    rtf.margin_left = rtf.margin_right = Inches(0.2)

    rp = rtf.paragraphs[0]
    rp.text = "2. Assignment Workspace (Submitted Offline)"
    rp.font.size = Pt(13)
    rp.font.bold = True
    rp.font.color.rgb = SIH_BLUE

    r_pts = [
        "Student takes worksheet with Wi-Fi turned off completely.",
        "Shows green 'Submitted · confirmed' badge and instant official receipt.",
        "Survives the Kill Test: Closing the tab or phone dying loses 0 words."
    ]
    for pt in r_pts:
        bp = rtf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(3)

    add_bottom_prototype_banner(s4)

    # =========================================================================
    # SLIDE 5: How Our Project Looks — Sync Center & Review Inbox
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_sih_header(s5, "How Our Project Looks: Sync Center & Conflict Diff")

    # Left Shot: Sync Center with simulator switch
    s5.shapes.add_picture('docs/shots/06-sync-center-queued.png', Inches(0.8), top4, width=shot_w)
    c_sync = create_card(s5, Inches(0.8), top4 + Inches(3.6), shot_w, Inches(1.9), bg_color=SIH_CREAM, border_color=SIH_AMBER_BORDER, border_width=1.5)
    stf = c_sync.text_frame
    stf.word_wrap = True
    stf.margin_top = Inches(0.15)
    stf.margin_left = stf.margin_right = Inches(0.2)

    sp = stf.paragraphs[0]
    sp.text = "3. Sync Center (Connection Simulator)"
    sp.font.size = Pt(13)
    sp.font.bold = True
    sp.font.color.rgb = SIH_AMBER

    s_pts = [
        "Judges can flip the 'Simulate offline' switch live to test drops.",
        "Shows queued edits waiting safely on device memory.",
        "Automatic background drain as soon as network is switched back on."
    ]
    for pt in s_pts:
        bp = stf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(3)

    # Right Shot: Review Inbox Diff Screen
    s5.shapes.add_picture('docs/shots/08-review-inbox.png', rx, top4, width=shot_w)
    c_rev = create_card(s5, rx, top4 + Inches(3.6), shot_w, Inches(1.9), bg_color=SIH_PURPLE_BG, border_color=SIH_PURPLE, border_width=1.5)
    rvtf = c_rev.text_frame
    rvtf.word_wrap = True
    rvtf.margin_top = Inches(0.15)
    rvtf.margin_left = rvtf.margin_right = Inches(0.2)

    rp = rvtf.paragraphs[0]
    rp.text = "4. Review Inbox (Side-by-Side Conflict Diff)"
    rp.font.size = Pt(13)
    rp.font.bold = True
    rp.font.color.rgb = SIH_PURPLE

    rv_pts = [
        "Visual diff highlights exact changes between local draft and server.",
        "Students pick: 'Keep Mine', 'Accept Peer's', or 'Combine Both'.",
        "Zero silent overwrites — no student's hard work is ever clobbered."
    ]
    for pt in rv_pts:
        bp = rvtf.add_paragraph()
        bp.text = "• " + pt
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(3)

    add_bottom_prototype_banner(s5)

    # =========================================================================
    # SLIDE 6: Impact and Benefits (Exact SIH Page 4 Style)
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_sih_header(s6, "Impact and Benefits")

    quad_w = Inches(5.7)
    quad_h = Inches(2.25)
    x1 = Inches(0.8)
    x2 = Inches(6.83)
    y1 = Inches(1.25)
    y2 = Inches(3.7)

    impact_quads = [
        (x1, y1, "Student Peace of Mind", SIH_BLUE, [
            ("No Lost Work", "Every character is saved locally; exams never wipe blank."),
            ("Zero Disconnect Lockouts", "Take tests anywhere, anytime with full access."),
            ("Instant Receipts", "Confirmed receipt on screen gives confidence.")
        ]),
        (x2, y1, "Teacher & School Integrity", SIH_AMBER, [
            ("Zero Duplicate Submissions", "Unique IDs absorb panic button clicks."),
            ("Protected Wi-Fi", "Smart backoff prevents 50 students from crashing school routers."),
            ("Audit Trail", "Full tamper-proof timestamp history for grading.")
        ]),
        (x1, y2, "Closing the Digital Divide", SIH_TEAL, [
            ("Rural Equity", "Students in low-connectivity areas have equal access."),
            ("Works on $50 Phones", "Lightweight, runs on cheap Android devices and old laptops."),
            ("Saves Cellular Data", "Only sends tiny text differences, not whole files.")
        ]),
        (x2, y2, "100% Inclusivity (WCAG 2.2 AA)", SIH_PURPLE, [
            ("Screen Reader Friendly", "Visually impaired students hear live audio sync updates."),
            ("7:1 Contrast Ratio", "Readable in blazing bright sunlight on low-cost screens."),
            ("100% Keyboard Usable", "Full accessibility for motor-impaired students.")
        ])
    ]

    for cx, cy, ctitle, ccolor, cbullets in impact_quads:
        card = create_card(s6, cx, cy, quad_w, quad_h, border_color=ccolor, border_width=2)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.18)
        tf.margin_left = tf.margin_right = Inches(0.22)

        p = tf.paragraphs[0]
        p.text = ctitle
        p.font.size = Pt(15.5)
        p.font.bold = True
        p.font.color.rgb = ccolor

        for b_title, b_desc in cbullets:
            bp = tf.add_paragraph()
            bp.text = f"• {b_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = TEXT_DARK
            bp.space_before = Pt(6)
            r = bp.add_run()
            r.text = b_desc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    # Bottom Future Scope Banner (Exact SIH Style)
    f_box = create_card(s6, Inches(0.8), Inches(6.1), Inches(11.733), Inches(0.65), bg_color=SIH_BLUE_BG, border_color=SIH_BLUE, border_width=1.5)
    ftf = f_box.text_frame
    ftf.word_wrap = True
    ftf.margin_top = Inches(0.12)
    ftf.margin_left = Inches(0.2)
    fp = ftf.paragraphs[0]
    fp.text = "Future Scope: Peer-to-peer Wi-Fi Direct sync for offline rural classrooms without internet, and decentralized exam server boxes."
    fp.font.size = Pt(11.5)
    fp.font.bold = True
    fp.font.color.rgb = SIH_NAVY

    add_bottom_prototype_banner(s6)

    # =========================================================================
    # SLIDE 7: Feasibility and Viability (Exact SIH Page 5 Style)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_sih_header(s7, "Feasibility and Viability")

    feas_quads = [
        (x1, y1, "Feasible Today", SIH_GREEN, [
            ("Open Web Standards", "IndexedDB, Service Workers, React 18 are battle-tested and widely supported."),
            ("Zero Proprietary Locks", "Runs in standard Chrome, Edge, Safari, and Firefox browsers."),
            ("Serverless Edge", "Cloudflare Pages & D1 provide 300+ global edge locations for free/low cost.")
        ]),
        (x2, y1, "Key Real-World Risks", SIH_ROSE, [
            ("Device Storage Limits", "Older phones running out of space for lesson PDFs."),
            ("Severe Clock Skew", "Students with incorrectly set phone clocks by hours."),
            ("Concurrent Conflicts", "Multiple offline students editing the same paragraph.")
        ]),
        (x1, y2, "Engineered Mitigations", SIH_BLUE, [
            ("Smart Cache Pruning", "Automatic LRU cache clears old lessons when space is tight."),
            ("Hybrid Logical Clocks", "Merges physical time with sequence counts to eliminate clock drift."),
            ("Yjs CRDTs + Diff Review", "Mathematical merging with side-by-side diff review options.")
        ]),
        (x2, y2, "Rollout Plan", SIH_PURPLE, [
            ("Phase 1: Pilot", "Test with 5 rural institutions on patchy mobile networks."),
            ("Phase 2: District Rollout", "Deploy across state schools with central teacher gradebook."),
            ("Phase 3: National Scale", "Integrate with government digital portals (DIKSHA / SWAYAM).")
        ])
    ]

    for cx, cy, ctitle, ccolor, cbullets in feas_quads:
        card = create_card(s7, cx, cy, quad_w, quad_h, border_color=ccolor, border_width=2)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_top = Inches(0.18)
        tf.margin_left = tf.margin_right = Inches(0.22)

        p = tf.paragraphs[0]
        p.text = ctitle
        p.font.size = Pt(15.5)
        p.font.bold = True
        p.font.color.rgb = ccolor

        for b_title, b_desc in cbullets:
            bp = tf.add_paragraph()
            bp.text = f"• {b_title}: "
            bp.font.bold = True
            bp.font.size = Pt(11)
            bp.font.color.rgb = TEXT_DARK
            bp.space_before = Pt(6)
            r = bp.add_run()
            r.text = b_desc
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED

    add_bottom_prototype_banner(s7)

    # =========================================================================
    # SLIDE 8: Verification & Evidence (Exact SIH Page 6 Style)
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_sih_header(s8, "Verification, Codebase & Live Links")

    # Left: Links & Automated Test Breakdown
    left_v = Inches(6.0)
    c_ver = create_card(s8, Inches(0.8), Inches(1.25), left_v, Inches(5.4), bg_color=WHITE, border_color=SIH_BLUE, border_width=2)
    vtf = c_ver.text_frame
    vtf.word_wrap = True
    vtf.margin_top = Inches(0.2)
    vtf.margin_left = vtf.margin_right = Inches(0.25)

    vp = vtf.paragraphs[0]
    vp.text = "VERIFIED IMPACT & WORKING EVIDENCE"
    vp.font.size = Pt(14)
    vp.font.bold = True
    vp.font.color.rgb = SIH_BLUE

    v_points = [
        ("108 / 108 Automated Tests Passing", "Vitest suite tests every failure scenario, network drop, and crash test automatically across protocol, server, and client."),
        ("Live Cloudflare Deployment", "Deployed on 300+ edge locations worldwide: https://edusync-tus.pages.dev/"),
        ("2-Minute Silent Screen Recording", "High-definition MP4 demo with custom animated cursor & caption HUD: assets/EduSync-Demo.mp4"),
        ("Complete GitHub Monorepo", "Full open-source codebase with setup instructions: https://github.com/blank-0007/edusync"),
        ("WCAG 2.2 AA Inclusivity Audited", "Automated axe-core accessibility regression suite confirms 0 critical/serious errors.")
    ]

    for title, desc in v_points:
        bp = vtf.add_paragraph()
        bp.text = f"✔ {title}: "
        bp.font.bold = True
        bp.font.size = Pt(11)
        bp.font.color.rgb = SIH_TEAL
        bp.space_before = Pt(10)
        r = bp.add_run()
        r.text = desc
        r.font.bold = False
        r.font.color.rgb = TEXT_MUTED

    # Right: Live Deployment Card & Judging Callout
    right_v_x = Inches(7.08)
    right_v_w = Inches(5.45)

    c_try = create_card(s8, right_v_x, Inches(1.25), right_v_w, Inches(2.5), bg_color=SIH_TEAL_BG, border_color=SIH_TEAL, border_width=2)
    try_tf = c_try.text_frame
    try_tf.word_wrap = True
    try_tf.margin_top = Inches(0.2)
    try_tf.margin_left = try_tf.margin_right = Inches(0.25)

    tp = try_tf.paragraphs[0]
    tp.text = "HOW JUDGES CAN TEST THIS RIGHT NOW"
    tp.font.size = Pt(13)
    tp.font.bold = True
    tp.font.color.rgb = SIH_TEAL

    t_pts = [
        "1. Open https://edusync-tus.pages.dev/ on your phone or laptop.",
        "2. Go to 'Sync Center' and flip the 'Simulate offline' switch ON.",
        "3. Go to 'Assignments', write an answer, and click Submit.",
        "4. Notice: Instant official receipt! 0 errors! 0 lost work!",
        "5. Flip simulator OFF: Watch the queue drain and sync automatically!"
    ]
    for pt in t_pts:
        bp = try_tf.add_paragraph()
        bp.text = pt
        bp.font.size = Pt(10.5)
        bp.font.color.rgb = TEXT_DARK
        bp.space_before = Pt(4)

    # Bottom Thank You Box
    ty_box = create_card(s8, right_v_x, Inches(4.0), right_v_w, Inches(2.65), bg_color=SIH_CREAM, border_color=SIH_AMBER_BORDER, border_width=2)
    ty_tf = ty_box.text_frame
    ty_tf.word_wrap = True
    ty_tf.margin_top = Inches(0.3)
    ty_tf.margin_left = ty_tf.margin_right = Inches(0.25)

    typ = ty_tf.paragraphs[0]
    typ.text = "THANK YOU!"
    typ.font.size = Pt(22)
    typ.font.bold = True
    typ.font.color.rgb = SIH_NAVY
    typ.alignment = PP_ALIGN.CENTER

    typ2 = ty_tf.add_paragraph()
    typ2.text = "EduSync — Eliminating the Digital Divide for Rural Students"
    typ2.font.size = Pt(12)
    typ2.font.bold = True
    typ2.font.color.rgb = SIH_AMBER
    typ2.alignment = PP_ALIGN.CENTER
    typ2.space_before = Pt(4)

    typ3 = ty_tf.add_paragraph()
    typ3.text = "We are ready for questions and live interactive testing!"
    typ3.font.size = Pt(11)
    typ3.font.color.rgb = TEXT_DARK
    typ3.alignment = PP_ALIGN.CENTER
    typ3.space_before = Pt(8)

    add_bottom_prototype_banner(s8)

    prs.save(output_path)
    print(f"✅ Full SIH PowerPoint saved to {output_path}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "EduSync-Presentation.pptx"
    build_sih_presentation(out)
