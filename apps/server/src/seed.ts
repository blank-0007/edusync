import type { DatabaseSync } from 'node:sqlite';
import type { Lesson, RubricCriterion } from '@edusync/protocol';
import { transaction } from './db';

/**
 * Catalog seed from docs/CONTRACT.md §1. Ids are exact: the web app and the e2e smoke
 * test assume them. Seeding is idempotent (INSERT OR IGNORE by primary key) so it is
 * safe to run on every boot and never clobbers user data.
 */

const USERS = [
  {
    id: 'u_priya',
    name: 'Dr. Priya Nair',
    role: 'instructor' as const,
    email: 'priya.nair@university.edu',
    initials: 'PN',
  },
  {
    id: 'u_aarav',
    name: 'Aarav Menon',
    role: 'student' as const,
    email: 'aarav.menon@student.edu',
    initials: 'AM',
  },
  {
    id: 'u_yuki',
    name: 'Yuki Tanaka',
    role: 'student' as const,
    email: 'yuki.tanaka@student.edu',
    initials: 'YT',
  },
];

interface SeedLesson {
  id: string;
  title: string;
  summary: string;
  body: string;
  durationMin: number;
  media: Lesson['media'];
}

const LESSONS: SeedLesson[] = [
  {
    id: 'l_1',
    title: 'Osmosis and tonicity',
    summary:
      'Water moves down its own concentration gradient across a semi-permeable membrane; tonicity predicts the direction and the fate of the cell.',
    durationMin: 9,
    media: [
      { kind: 'video', label: 'Lecture · Osmosis and tonicity (9 min)', sizeKb: 54000 },
      { kind: 'pdf', label: 'Checkpoint quiz (2 questions)', sizeKb: 260 },
    ],
    body: `Osmosis is the diffusion of water across a selectively permeable membrane from a region of higher water concentration (lower solute concentration) to a region of lower water concentration (higher solute concentration). The membrane does not need a pump or an energy source for this to happen: water is small and uncharged enough to slip through the lipid bilayer and, far faster, through aquaporins. What the membrane cannot do is let the solute cross, and that asymmetry is what generates the pressure.

Tonicity is a comparative term, not a property of a solution in isolation. A solution is hypertonic to a cell when it has a higher concentration of non-penetrating solutes than the cytosol; water leaves, the cell shrinks (crenation). A hypotonic solution has fewer non-penetrating solutes; water enters and an animal cell may swell and lyse. An isotonic solution causes no net movement — water still crosses in both directions, but at equal rates. Note that the distinction between osmolarity and tonicity matters: a solution can be iso-osmotic yet hypotonic if its solutes cross the membrane and therefore do not hold water in the extracellular compartment.

For a human red blood cell, plasma is close to isotonic (about 300 mOsm). The cell has no cell wall to oppose swelling, so a fall in plasma osmolality is dangerous, whereas a plant cell in pure water simply becomes turgid against its wall. In the lab you will weigh potato strips or inspect erythrocytes in graded NaCl solutions; the inflection point of the curve is the isotonic concentration, and the slope tells you the rate at which water crosses.`,
  },
  {
    id: 'l_2',
    title: 'Facilitated diffusion: GLUT transporters',
    summary:
      'Facilitated diffusion is passive transport through a protein: down the electrochemical gradient, no ATP, but with saturation, specificity and competition.',
    durationMin: 11,
    media: [
      { kind: 'video', label: 'Lecture · GLUT transporters (11 min)', sizeKb: 63000 },
      { kind: 'pdf', label: 'Figure sheet · alternate-access model', sizeKb: 420 },
    ],
    body: `Glucose is polar and cannot cross the lipid bilayer at a useful rate, yet it must enter cells without the cell spending ATP. Facilitated diffusion solves this with a family of uniporters — the GLUT (SLC2) proteins — that bind glucose on one side, change conformation, and release it on the other. The transport is passive: it is driven entirely by the glucose concentration gradient, so the direction of net flux reverses when the gradient reverses.

The kinetics betray the mechanism. Unlike simple diffusion, facilitated diffusion saturates: as extracellular glucose rises, the flux approaches Vmax = kcat × [transporter], and the concentration that gives half-maximal flux is Km. Different GLUT isoforms have different Km values, which is why GLUT1 (Km ≈ 1–3 mM) keeps basal uptake running even when blood glucose is low, while GLUT4 (Km ≈ 5 mM) is insulin-responsive and dominates postprandial muscle and fat uptake. Competition between glucose and structurally similar sugars (e.g. galactose, 3-O-methylglucose) is another fingerprint of a protein carrier; simple diffusion shows no such competition.

The alternate-access model explains the conformational cycle: the transporter is never open to both sides at once, so it cannot create a concentration gradient, it can only equilibrate one. Fold this into the same transport unit as the Na⁺/K⁺ ATPase you will meet next: the pump establishes the Na⁺ gradient that powers secondary active transport, while GLUT proteins let glucose equilibrate passively down the gradient the pump's cousins created.`,
  },
  {
    id: 'l_3',
    title: 'Ion pumps and the Na⁺/K⁺ ATPase',
    summary:
      'The Na⁺/K⁺ ATPase exports three Na⁺ and imports two K⁺ per ATP, is electrogenic, and sets up the gradients that underlie resting potential and secondary transport.',
    durationMin: 14,
    media: [
      { kind: 'pdf', label: 'Diagram · Na⁺/K⁺ ATPase cycle (4 states)', sizeKb: 880 },
      { kind: 'video', label: 'Walkthrough · pump current and Vm (6 min)', sizeKb: 39000 },
    ],
    body: `The Na⁺/K⁺ ATPase is an electrogenic P-type pump: for every ATP hydrolysed it moves three Na⁺ ions out of the cell and two K⁺ ions in. Two cations leave, two enter — so the charge balance would be almost neutral — except that one extra positive charge is exported per cycle. That 1-in-3 stoichiometry is the source of the pump's electrogenic current: the pump itself hyperpolarises the membrane by a few millivolts, and its current is the small "electrogenic current" that must be accounted for when you compute Vm from the Goldman equation.

Mechanically, the pump cycles through E1 and E2 states. In the E1 conformation, the transport sites face the cytosol and bind three Na⁺ with high affinity. ATP phosphorylates the pump at an aspartate residue, which lowers Na⁺ affinity and drives the E1→E2 transition, releasing Na⁺ outside. E2 then binds two K⁺ from the extracellular side with high affinity, and K⁺ binding triggers dephosphorylation and a return to E1, releasing K⁺ into the cytosol. Ouabain and digitalis bind the E2 state from the extracellular face and lock the pump, which is why they raise intracellular Na⁺ and, indirectly, intracellular Ca²⁺.

Because the pump keeps intracellular Na⁺ low and intracellular K⁺ high, it maintains the gradients that the leak channels dissipate. Blocking the pump with ouabain causes the gradients to run down: intracellular Na⁺ rises, K⁺ falls, and the resting potential slowly depolarises toward zero as the K⁺ equilibrium potential becomes less negative. The pump consumes a large fraction of the brain's ATP — which is why its inhibition is so quickly lethal.`,
  },
  {
    id: 'l_4',
    title: 'Membrane transport: active vs passive',
    summary:
      'A decision tree for transport: passive (simple diffusion, facilitated diffusion, channels) versus active (primary ATP-driven pumps, secondary cotransport), with the energetics that distinguish them.',
    durationMin: 12,
    media: [
      { kind: 'video', label: 'Lecture · active vs passive transport (12 min)', sizeKb: 68000 },
      { kind: 'audio', label: 'Revision capsule (4 min)', sizeKb: 3800 },
    ],
    body: `Classify a transport process by asking where the energy comes from, not by asking whether a protein is involved. Passive transport — simple diffusion, facilitated diffusion, and diffusion through channels — proceeds down the electrochemical gradient and needs no input of metabolic energy. Active transport moves a solute against its electrochemical gradient and must be coupled to an energy source. Primary active transport couples directly to ATP hydrolysis (Na⁺/K⁺ ATPase, Ca²⁺ ATPase, H⁺/K⁺ ATPase). Secondary active transport couples to the electrochemical gradient of another ion, usually Na⁺, that a primary pump built: the Na⁺/glucose symporter and the Na⁺/Ca²⁺ exchanger are the canonical examples.

Channels and carriers deserve separate thought. Channels are pores that are far faster (10⁶–10⁸ ions/s) and are gated by voltage, ligands or tension; they do not bind the substrate in the carrier sense and are not saturated at physiological concentrations. Carriers (transporters) alternate access, bind their substrate, and turn over 10²–10⁴ times per second. Both can be passive or active, but only pumps hydrolyse ATP.

Energetics make the distinction quantitative. The free energy of moving an ion is ΔG = RT ln([X]in/[X]out) + zFΔVm. For a univalent ion at 37 °C, a tenfold concentration gradient is worth about 61 mV. The Na⁺/K⁺ ATPase pays about 50 kJ/mol to export Na⁺ and import K⁺ against their gradients, which is roughly one ATP's worth under cellular conditions. Work the numbers for the worksheet: quote the Table 2 concentrations, compute the Nernst potential for K⁺ and Na⁺, and then layer the pump's electrogenic contribution on top of the K⁺ leak.`,
  },
  {
    id: 'l_5',
    title: 'Lab 3 prep: cell fractionation',
    summary:
      'Differential centrifugation separates organelles by size and density; the protocol covers homogenisation, spin speeds, marker enzymes and the Na⁺/K⁺ ATPase assay.',
    durationMin: 7,
    media: [
      { kind: 'pdf', label: 'Lab 3 protocol (6 pp)', sizeKb: 1420 },
      { kind: 'video', label: 'Safety briefing (3 min)', sizeKb: 21000 },
    ],
    body: `Lab 3 uses differential centrifugation to separate the components of a cell lysate so that the plasma-membrane fraction can be assayed for Na⁺/K⁺ ATPase activity. Everything hinges on doing the steps cold, quickly and gently: a warmed or vigorously homogenised sample loses membrane vesicles to aggregation, and you will see the marker-enzyme cross-contamination in your results.

Start with a chilled isotonic buffer containing protease inhibitors. Homogenise on ice with a Dounce homogeniser (loose pestle first, then tight) and pass the lysate through cheesecloth to remove connective tissue. Centrifuge at 1,000 × g for 10 minutes to pellet nuclei and unbroken cells. Spin the supernatant at 10,000 × g for 20 minutes to pellet mitochondria and lysosomes, then at 100,000 × g for 60 minutes to pellet total membranes. The final supernatant is the cytosol fraction. Resuspend each pellet in a small volume of cold buffer rather than vortexing.

You will verify the fractions with marker enzymes: succinate dehydrogenase for mitochondria, acid phosphatase for lysosomes, and Na⁺/K⁺ ATPase for the plasma-membrane fraction. For the ATPase assay, measure ouabain-sensitive phosphate release: total ATPase activity minus activity in the presence of 1 mM ouabain is the Na⁺/K⁺ ATPase component. The membrane fraction from the 100,000 × g spin should be enriched; if the activity in the mitochondrial pellet is high, your homogenisation was too harsh. Keep a table of protein concentration and specific activity for each fraction — the worksheet asks you to compare the enrichments.`,
  },
  {
    id: 'l_6',
    title: 'Membrane transport problem set',
    summary:
      'Twelve problems: Nernst and Goldman calculations, pump stoichiometry, ouabain, GLUT kinetics, and active-versus-passive classification.',
    durationMin: 25,
    media: [
      { kind: 'pdf', label: 'Problem set (12 questions)', sizeKb: 1450 },
      { kind: 'pdf', label: 'Table 2 · ion concentrations', sizeKb: 180 },
    ],
    body: `This problem set is the quantitative counterpart of lessons 1–5. Work without a calculator first, then check with one. Constants you will need: R = 8.314 J/mol·K, F = 96,485 C/mol, T = 310 K, 2.303RT/F ≈ 61 mV at 37 °C.

Questions 1–3 concern the Nernst equation. Given the Table 2 concentrations (Na⁺ and K⁺ are quoted for intracellular and extracellular compartments; the Cl⁻ row is deliberately blank so you must decide whether chloride can be treated as a passive, permeant ion), compute E_K and E_Na. Then decide which ion dominates the resting potential of a neuron with the stated relative permeabilities, and how sensitive that answer is to a threefold change in P_Na.

Questions 4–7 concern the Na⁺/K⁺ ATPase. Use the 3 Na⁺ : 2 K⁺ stoichiometry to calculate the pump current for a stated turnover rate, decide the sign of the current relative to Vm, and predict the effect of ouabain on Vm over the first minute and after ten minutes. You will need one value from Table 2 to finish the ouabain question — say which value and why it matters.

Questions 8–12 are short answer. Classify each transport process in the supplied list as passive, primary active or secondary active, justify in one sentence, and name the driving energy source. Then estimate Vmax and Km from the provided GLUT uptake data, and explain why the observed flux saturates while simple diffusion does not. Submit your written answers through the worksheet; the rubric is on the assignment page.`,
  },
];

const RUBRIC: RubricCriterion[] = [
  {
    id: 'r1',
    label: 'Pump stoichiometry (3 Na⁺ out : 2 K⁺ in)',
    points: 4,
    hint: 'Covered in line 2',
  },
  {
    id: 'r2',
    label: 'Links pump current to resting potential',
    points: 4,
    hint: '"electrogenic current" paragraph',
  },
  {
    id: 'r3',
    label: 'Predicts ouabain effect on Vm',
    points: 3,
    hint: 'Needs a table value',
  },
  {
    id: 'r4',
    label: 'Uses Table 2 concentrations',
    points: 3,
    hint: 'Na⁺ and K⁺ quoted; Cl⁻ missing',
  },
];

const ASSIGNMENT_PROMPT = `Membrane transport worksheet (14 points).

The Na⁺/K⁺ ATPase is the single largest consumer of ATP in a neuron, and its 3 Na⁺-out : 2 K⁺-in stoichiometry makes it electrogenic. In this worksheet you will connect the pump's cycle to the resting potential of a cell, using the ion concentrations in Table 2 of your lab handout.

Answer all four parts, in order:

1. State the pump stoichiometry and explain, in one or two sentences, why the cycle moves more charge out of the cell than into it. (Stoichiometry and charge balance; credit for naming the E1/E2 states.)
2. Link the pump's electrogenic current to the resting potential: explain how a pump that exports net positive charge contributes to Vm, and how that contribution interacts with the K⁺ leak conductance. Use the phrase "electrogenic current" explicitly.
3. Predict what ouabain does to Vm in the first minute and after prolonged exposure, and justify your prediction with the change in the ion gradients. Cite one value from Table 2 in your justification.
4. Use the Table 2 concentrations: quote the intracellular and extracellular Na⁺ and K⁺ values you used and show the Nernst calculation for E_K. Note whether the Cl⁻ row is complete, and state whether you can compute E_Cl from the table as given.

Submit through the assignment page. Your submission is recorded exactly once even if the connection drops and the client retries — the receipt shows the canonical attempt.`;

function nowIso(now: number): string {
  return new Date(now).toISOString();
}

/**
 * Seed the catalog. Idempotent: `INSERT OR IGNORE` keyed by primary key. The assignment
 * due date is computed from the first boot time (three days out) and never rewritten.
 */
export function seed(db: DatabaseSync, now: number = Date.now()): void {
  transaction(db, () => {
    const createdAt = nowIso(now);

    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, name, role, email, initials, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const user of USERS) {
      insertUser.run(user.id, user.name, user.role, user.email, user.initials, createdAt);
    }

    db.prepare('INSERT OR IGNORE INTO courses (id, title, code, instructor_id) VALUES (?, ?, ?, ?)').run(
      'c_bio201',
      'Cell Biology',
      'BIOL 201',
      'u_priya',
    );

    const insertLesson = db.prepare(
      `INSERT OR IGNORE INTO lessons
         (id, course_id, title, summary, body, duration_min, position, media_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    LESSONS.forEach((lesson, index) => {
      insertLesson.run(
        lesson.id,
        'c_bio201',
        lesson.title,
        lesson.summary,
        lesson.body,
        lesson.durationMin,
        index + 1,
        JSON.stringify(lesson.media),
      );
    });

    db.prepare(
      `INSERT OR IGNORE INTO assignments (id, course_id, title, prompt, points, due_at, rubric_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'a_3',
      'c_bio201',
      'Membrane transport worksheet',
      ASSIGNMENT_PROMPT,
      14,
      new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      JSON.stringify(RUBRIC),
    );
  });
}
