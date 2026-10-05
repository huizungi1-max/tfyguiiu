/**
 * AUTHORITATIVE CONTENT
 * ---------------------------------------------------------------------------
 * Every word shown on the site comes from this file. It is rendered into the
 * static HTML at build time (see vite.config.ts) and imported by the runtime
 * for the 3D typography.
 *
 * Integrity rule: nothing here claims completed work, employment, results or
 * measurements. Projects are a planned engineering roadmap (Sep 2026 → May
 * 2029). When a build produces real evidence, update its `status` and add an
 * `evidence` link — the UI will pick it up.
 */

export type Status = 'roadmap' | 'in-progress' | 'complete';

export interface ContactLink {
  label: string;
  href: string;
  display: string;
}

export const site = {
  name: 'Kaushal',
  field: 'Electronics Systems Engineering',
  fieldLong: 'Electronics Systems / Electronics & Communication Engineering',
  primary: 'Digital Hardware / FPGA-RTL + Embedded Firmware',
  positioning:
    'Electronics Systems engineer developing depth across digital hardware, FPGA/RTL and embedded firmware, with supporting capability in Linux, PCB/hardware debugging, DSP, sensors, control and programming.',
  span: { from: 'SEP 2026', to: 'MAY 2029' },
  /**
   * CONTACT — replace the placeholder email with your real address.
   * Optional links render automatically once a URL is filled in.
   */
  contact: {
    email: 'kaushal@example.com',
    links: [
      { label: 'GitHub', href: '', display: '' },
      { label: 'LinkedIn', href: '', display: '' },
      { label: 'CV', href: '', display: '' },
    ] as ContactLink[],
  },
  meta: {
    title: 'Kaushal — Digital Hardware / FPGA-RTL + Embedded Firmware',
    description:
      'Kaushal — Electronics Systems engineer developing depth across digital hardware, FPGA/RTL and embedded firmware. An evidence-driven engineering roadmap, Sep 2026 → May 2029.',
  },
};

/* ------------------------------------------------------------------------ */
/* Sections — the spatial journey                                            */
/* ------------------------------------------------------------------------ */

export interface SectionDef {
  id: string;
  label: string;
  steps: number;
}

export const sections: SectionDef[] = [
  { id: 'origin', label: 'Origin', steps: 1 },
  { id: 'position', label: 'Position', steps: 1 },
  { id: 'roadmap', label: 'Roadmap', steps: 1 },
  { id: 'builds', label: 'Builds', steps: 8 },
  { id: 'stack', label: 'Stack', steps: 2 },
  { id: 'directions', label: 'Directions', steps: 1 },
  { id: 'contact', label: 'Contact', steps: 1 },
];

/* ------------------------------------------------------------------------ */
/* 02 — Position: the system stack, physical → logical                       */
/* ------------------------------------------------------------------------ */

export interface Layer {
  name: string;
  role: 'core' | 'support';
}

/** Ordered bottom (physical) → top (logical). The two core layers sit at the hardware/software boundary. */
export const layers: Layer[] = [
  { name: 'Hardware / PCB', role: 'support' },
  { name: 'Sensors', role: 'support' },
  { name: 'DSP / Signal Processing', role: 'support' },
  { name: 'Control Systems', role: 'support' },
  { name: 'Communication Systems', role: 'support' },
  { name: 'Digital Hardware / FPGA-RTL', role: 'core' },
  { name: 'Embedded Firmware', role: 'core' },
  { name: 'Embedded Linux', role: 'support' },
  { name: 'Programming / DSA', role: 'support' },
];

/* ------------------------------------------------------------------------ */
/* 03 — Roadmap: nine academic terms                                         */
/* ------------------------------------------------------------------------ */

export interface Term {
  id: string; // T1..T9
  date: string; // display
  start: [number, number]; // [year, monthIndex 0-11]
  academic: string[];
  technical: string[];
  technicalLabel?: string;
  build: string;
  buildRef?: number; // index into projects
}

export const terms: Term[] = [
  {
    id: 'T1',
    date: 'SEP 2026',
    start: [2026, 8],
    academic: ['EE2101 Signals & Systems', 'CS1002 Python', 'EE2106 Computer Organisation'],
    technical: ['C pointers / structs / bitwise', 'Python NumPy', 'Git / GitHub', 'Linux CLI', 'Digital / circuit repair'],
    build: 'STM32 UART + LED control',
    buildRef: 0,
  },
  {
    id: 'T2',
    date: 'JAN 2027',
    start: [2027, 0],
    academic: ['EE2102 Analog Electronic Systems + lab', 'EE2103 Digital System Design + lab'],
    technical: ['Op-amp circuits', 'BJT / MOSFET basics', 'Verilog RTL', 'Testbenches', 'Icarus / GTKWave', 'LTspice', 'Oscilloscope'],
    build: 'Digital + analog thermometer',
    buildRef: 1,
  },
  {
    id: 'T3',
    date: 'MAY 2027',
    start: [2027, 4],
    academic: ['EE3101 DSP', 'EE2105 Testing & Measurement', 'EE3103 Sensors + lab'],
    technical: ['Sampling', 'DFT / FFT', 'FIR / IIR basics', 'Sensor interfaces', 'ADC', 'UART / I²C / SPI', 'Measurement', 'Debugging'],
    build: 'IMU / sensor logger + real-time FIR pipeline',
    buildRef: 2,
  },
  {
    id: 'T4',
    date: 'SEP 2027',
    start: [2027, 8],
    academic: ['EE4101 Embedded Linux & FPGAs + lab', 'EE3104 EMFT', 'MA4101 Math II'],
    technical: ['Embedded Linux userspace', 'Cross-compilation', 'Serial console', 'FPGA synthesis', 'Verilog / SystemVerilog', 'Constraints', 'Timing', 'Board bring-up'],
    build: 'FPGA UART / display subsystem',
    buildRef: 3,
  },
  {
    id: 'T5',
    date: 'JAN 2028',
    start: [2028, 0],
    academic: ['EE4103 Communication Systems', 'EE3102 Control', 'MA3101 Probability & Statistics'],
    technical: ['FreeRTOS tasks', 'Queues', 'Semaphores', 'Timers', 'Interrupts', 'CAN', 'Control / PID', 'Python test automation', 'C++ basics / STL'],
    build: 'Multi-sensor FreeRTOS control node with PID',
    buildRef: 4,
  },
  {
    id: 'T6',
    date: 'MAY 2028',
    start: [2028, 4],
    academic: ['EE3106 Semiconductor Devices & VLSI', 'EE3107 Analog Circuits', 'EE4102 Product Design'],
    technical: ['KiCad schematic / PCB', 'BOM', 'DRC', 'Power budgeting', 'Decoupling', 'Protection', 'Oscilloscope', 'Logic analyzer', 'Test plan', 'Product lifecycle'],
    build: 'Custom PCB supporting the evolving embedded system',
    buildRef: 5,
  },
  {
    id: 'T7',
    date: 'SEP 2028',
    start: [2028, 8],
    academic: ['EE5102 Digital IC Design', 'EE5101 IoT', 'GN3001 Professional Growth'],
    technical: ['SystemVerilog', 'Verification architecture', 'Assertions', 'Coverage concepts', 'Synthesis / timing', 'AMBA basics', 'Python / Bash / Tcl'],
    build: 'RTL subsystem + verification',
    buildRef: 6,
  },
  {
    id: 'T8',
    date: 'JAN 2029',
    start: [2029, 0],
    academic: ['EE5103 Power Management', 'EE4105 / EE4106 Comprehensive exams', 'Apprenticeship'],
    technicalLabel: 'Direction',
    technical: ['UVM basics for verification, where relevant', 'or BSP / driver / JTAG / GDB for firmware', 'Stronger C / C++', 'Interview debugging'],
    build: 'Integrated flagship capstone',
    buildRef: 7,
  },
  {
    id: 'T9',
    date: 'MAY 2029',
    start: [2029, 4],
    academic: ['EE4107 Comprehensive', 'Apprenticeship', 'EE3999 / EE4999 if required'],
    technical: ['Core revision', 'Interview-level digital / analog / embedded depth', 'Final DSA revision', 'Presentation skills'],
    build: 'Polish flagship — measurements, demo, README, diagrams, test evidence',
  },
];

/* ------------------------------------------------------------------------ */
/* 04 — Builds: eight projects                                               */
/* ------------------------------------------------------------------------ */

export interface Project {
  n: string; // 01..08
  title: string;
  titleLines: string[]; // display line breaks
  term: string; // T1..
  date: string;
  concept: string;
  stack: string[];
  focus: string[];
  /** Short note shown under concept where the brief adds context. */
  note?: string;
  figure: string; // caption for the illustrative visual
  extra?: { label: string; items: string[] }[];
  status: Status;
  evidence?: { label: string; href: string }[];
}

export const projects: Project[] = [
  {
    n: '01',
    title: 'STM32 UART + LED Control',
    titleLines: ['STM32 UART', '+ LED Control'],
    term: 'T1',
    date: 'SEP 2026',
    concept: 'A foundational embedded firmware system demonstrating MCU programming, UART communication and GPIO control.',
    stack: ['C', 'Embedded C', 'STM32', 'UART', 'GPIO'],
    focus: ['Firmware fundamentals', 'Debugging'],
    figure: 'Illustrative — one serial frame carrying the character “K”.',
    status: 'roadmap',
  },
  {
    n: '02',
    title: 'Analog + Digital Thermometer',
    titleLines: ['Analog + Digital', 'Thermometer'],
    term: 'T2',
    date: 'JAN 2027',
    concept: 'A combined analog/digital measurement system that builds on the first embedded stage.',
    stack: ['Analog circuits', 'Digital design', 'ADC', 'Verilog controller', 'Display / interface', 'LTspice', 'Testbench', 'Oscilloscope'],
    focus: ['Measurement', 'Analog + digital'],
    figure: 'Illustrative — one quantity, as a continuous curve and its quantised twin.',
    status: 'roadmap',
  },
  {
    n: '03',
    title: 'IMU / Sensor Logger + FIR',
    titleLines: ['IMU / Sensor', 'Logger + FIR'],
    term: 'T3',
    date: 'MAY 2027',
    concept: 'A sensor/IMU data acquisition and processing system with signal-processing capability — a real-time FIR pipeline.',
    stack: ['STM32 peripherals', 'IMU', 'Sensors', 'ADC / interface', 'UART', 'I²C', 'SPI', 'FIR filtering', 'DSP'],
    focus: ['Measurement', 'Debugging', 'Signal processing'],
    figure: 'Illustrative — an orientation frame beside a low-pass FIR impulse response.',
    status: 'roadmap',
  },
  {
    n: '04',
    title: 'FPGA UART / Display Subsystem',
    titleLines: ['FPGA UART /', 'Display Subsystem'],
    term: 'T4',
    date: 'SEP 2027',
    concept: 'A digital hardware system demonstrating progression from RTL design through FPGA implementation.',
    stack: ['FPGA', 'Verilog', 'RTL', 'UART', 'Display subsystem', 'Simulation', 'Synthesis', 'Constraints', 'Timing'],
    focus: ['FPGA bring-up', 'Linux / MCU interface concepts'],
    figure: 'Illustrative — an RTL description resolving into implemented fabric.',
    status: 'roadmap',
  },
  {
    n: '05',
    title: 'FreeRTOS Multi-Sensor + PID Control Node',
    titleLines: ['FreeRTOS Multi-Sensor', '+ PID Control Node'],
    term: 'T5',
    date: 'JAN 2028',
    concept: 'A real-time embedded control system combining multiple sensors, RTOS concepts and control logic.',
    stack: ['FreeRTOS', 'Tasks', 'Queues', 'Semaphores', 'Timers', 'Interrupts', 'CAN', 'PID', 'Python test automation', 'C++'],
    focus: ['Control systems', 'Real-time design'],
    figure: 'Illustrative — time-sliced tasks beneath a closed-loop step response.',
    status: 'roadmap',
  },
  {
    n: '06',
    title: 'Custom Sensor / Control PCB',
    titleLines: ['Custom Sensor /', 'Control PCB'],
    term: 'T6',
    date: 'MAY 2028',
    concept: 'A custom hardware platform supporting the evolving embedded system.',
    stack: ['KiCad', 'Schematics', 'PCB design', 'BOM', 'DRC', 'Power budgeting', 'Decoupling', 'Protection'],
    focus: ['Instrumentation', 'Oscilloscope', 'Logic analyzer', 'Hardware bring-up', 'Measurement', 'Revision'],
    figure: 'Illustrative — a board with probe points. No real layout implied.',
    status: 'roadmap',
  },
  {
    n: '07',
    title: 'RTL Subsystem + Verification',
    titleLines: ['RTL Subsystem', '+ Verification'],
    term: 'T7',
    date: 'SEP 2028',
    concept: 'An advanced RTL/verification project demonstrating progression toward semiconductor and digital hardware roles.',
    stack: ['SystemVerilog', 'RTL', 'Testbenches', 'Assertions', 'Coverage concepts', 'AMBA', 'Scripting', 'Synthesis', 'Timing'],
    focus: ['Verification', 'Digital IC direction'],
    figure: 'Illustrative — a design under test, enclosed by its verification environment.',
    status: 'roadmap',
  },
  {
    n: '08',
    title: 'Integrated Flagship',
    titleLines: ['Integrated', 'Flagship'],
    term: 'T8 → T9',
    date: 'JAN → MAY 2029',
    concept: 'The culmination of the roadmap: one integrated system drawing on the whole progression.',
    note: 'Product and architecture are deliberately left undefined — they will be shaped by the builds before it.',
    stack: ['PCB', 'Firmware', 'RTL', 'Linux', 'Communication', 'Verification', 'System architecture'],
    focus: ['Integration'],
    extra: [{ label: 'T9 polish', items: ['Measurements', 'Demo', 'README', 'Diagrams', 'Test evidence'] }],
    figure: 'Illustrative — seven disciplines converging into one integrated stack.',
    status: 'roadmap',
  },
];

/* ------------------------------------------------------------------------ */
/* 05 — Stack: grouped capabilities and their joints                         */
/* ------------------------------------------------------------------------ */

export interface Group {
  key: string;
  name: string;
  nameLines: string[];
  tier: 'core' | 'support' | 'software';
  items: string[];
  note?: string;
}

export const groups: Group[] = [
  {
    key: 'digital',
    name: 'Digital Hardware',
    nameLines: ['Digital', 'Hardware'],
    tier: 'core',
    items: ['Digital System Design', 'Verilog', 'SystemVerilog', 'RTL', 'FPGA', 'Simulation', 'Testbenches', 'Synthesis', 'Timing', 'Verification', 'Assertions', 'Coverage Concepts', 'AMBA'],
  },
  {
    key: 'embedded',
    name: 'Embedded Systems',
    nameLines: ['Embedded', 'Systems'],
    tier: 'core',
    items: ['STM32', 'GPIO', 'Timers', 'ADC', 'PWM', 'Interrupts', 'UART', 'SPI', 'I²C', 'FreeRTOS', 'CAN', 'Embedded Linux'],
  },
  {
    key: 'programming',
    name: 'Programming',
    nameLines: ['Programming'],
    tier: 'core',
    items: ['C', 'Embedded C', 'Python', 'C++', 'C++ STL'],
  },
  {
    key: 'hardware',
    name: 'Hardware / PCB',
    nameLines: ['Hardware', '/ PCB'],
    tier: 'support',
    items: ['Analog & Digital Circuits', 'KiCad', 'Schematics', 'BOM', 'DRC', 'PCB Design', 'Power Budgeting', 'Hardware Bring-up', 'Oscilloscope', 'Logic Analyzer', 'DMM', 'Hardware Debugging'],
  },
  {
    key: 'signal',
    name: 'Signal Processing / Systems',
    nameLines: ['Signal', 'Processing', '/ Systems'],
    tier: 'support',
    items: ['Signals & Systems', 'DSP', 'Sampling', 'DFT / FFT', 'FIR / IIR', 'Sensors', 'Control Systems', 'PID', 'Communication Systems', 'IoT'],
  },
  {
    key: 'tools',
    name: 'Software / Tools',
    nameLines: ['Software', '/ Tools'],
    tier: 'support',
    items: ['Git', 'GitHub', 'Linux CLI', 'Bash', 'Tcl', 'Python Automation', 'Testing', 'Debugging'],
  },
  {
    key: 'dsa',
    name: 'DSA',
    nameLines: ['DSA'],
    tier: 'software',
    note: 'Supporting software / interview capability — not the primary identity.',
    items: ['Arrays', 'Strings', 'Complexity', 'Linked Lists', 'Stacks', 'Queues', 'Recursion', 'Hashing', 'Two Pointers', 'Binary Search', 'Trees', 'Heaps', 'Sorting / Searching', 'Graphs', 'BFS / DFS', 'Greedy', 'Dynamic Programming', 'C++ STL'],
  },
];

/** Joints: where two capability groups meet. Derived only from items above and the roadmap. */
export interface Joint {
  a: string;
  b: string;
  via: string;
}

export const joints: Joint[] = [
  { a: 'embedded', b: 'digital', via: 'UART · SPI · I²C' },
  { a: 'programming', b: 'embedded', via: 'C · Embedded C' },
  { a: 'programming', b: 'digital', via: 'Scripting · Python / Tcl' },
  { a: 'embedded', b: 'hardware', via: 'Bring-up · Debugging' },
  { a: 'hardware', b: 'signal', via: 'Sensors · Measurement' },
];

/* ------------------------------------------------------------------------ */
/* 06 — Directions                                                            */
/* ------------------------------------------------------------------------ */

export interface Lane {
  name: string;
  family: 'digital' | 'firmware' | 'board';
  items: string[];
}

export const lanes: Lane[] = [
  { name: 'Semiconductor / Digital IC', family: 'digital', items: ['RTL', 'Digital design', 'Verification', 'Timing', 'Synthesis', 'Architecture concepts'] },
  { name: 'Design Verification', family: 'digital', items: ['SystemVerilog', 'Testbenches', 'Assertions', 'Coverage concepts', 'UVM basics', 'Regression thinking'] },
  { name: 'FPGA / RTL', family: 'digital', items: ['Verilog', 'SystemVerilog', 'Simulation', 'Synthesis', 'Timing', 'FPGA bring-up', 'Verification'] },
  { name: 'Embedded Firmware', family: 'firmware', items: ['C / Embedded C', 'Peripherals', 'RTOS', 'Debugging', 'Board bring-up'] },
  { name: 'Embedded Linux / BSP', family: 'firmware', items: ['Linux', 'Boot concepts', 'Cross-compilation', 'Serial / JTAG / GDB', 'Drivers / BSP'] },
  { name: 'Hardware / PCB', family: 'board', items: ['Schematics', 'Analog / digital circuits', 'KiCad', 'Power', 'Measurement', 'Bring-up'] },
];

export const families: Record<Lane['family'], string> = {
  digital: 'Digital hardware',
  firmware: 'Firmware',
  board: 'Board',
};

/* ------------------------------------------------------------------------ */
/* Calendar helpers (roadmap position is derived from dates, never claimed)   */
/* ------------------------------------------------------------------------ */

/** Index of the roadmap term that contains `date`, -1 before T1. Purely calendar-based. */
export function currentTermIndex(date = new Date()): number {
  const t = date.getFullYear() * 12 + date.getMonth();
  let idx = -1;
  terms.forEach((term, i) => {
    const s = term.start[0] * 12 + term.start[1];
    if (t >= s) idx = i;
  });
  // After T9's four-month window the roadmap calendar has ended.
  const last = terms[terms.length - 1].start;
  if (t >= last[0] * 12 + last[1] + 4) return terms.length;
  return idx;
}
