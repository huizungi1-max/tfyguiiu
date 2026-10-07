/**
 * AUTHORITATIVE CONTENT
 * ---------------------------------------------------------------------------
 * Every word shown on the site comes from this file. It is rendered into the
 * static HTML at build time (see vite.config.ts) and imported by the runtime
 * for the 3D typography.
 *
 * Integrity rule: nothing here claims employment, results, measurements,
 * customers or deployment. Skills and projects are presented as an established
 * technical profile; no study schedule, dates, exam or application planning
 * appear anywhere on the site. Real evidence (repos, write-ups) can be added to
 * a project's `evidence` list — the UI will pick it up.
 */

export interface ContactLink {
  label: string;
  href: string;
  display: string;
}

export const site = {
  name: 'Kaushal',
  field: 'Electronic Systems Engineering',
  fieldLong: 'BS Electronic Systems, IIT Madras · B.Tech Electronics & Communication Engineering',
  academic: 'BS Electronic Systems, IIT Madras + B.Tech Electronics & Communication Engineering',
  primary: 'Embedded Systems + Digital Hardware / FPGA-RTL',
  positioning:
    'Embedded and digital hardware engineer working across embedded firmware, hardware/PCB, FPGA/RTL, embedded Linux and semiconductor-oriented digital design — with DSP, sensors, control, communication and programming as supporting ground.',
  /**
   * CONTACT — the address the "send email" link and Copy button use.
   * Optional links render automatically once a URL is filled in.
   */
  contact: {
    email: 'sskaushal2005@gmail.com',
    links: [
      { label: 'GitHub', href: '', display: '' },
      { label: 'LinkedIn', href: '', display: '' },
      { label: 'CV', href: '', display: '' },
    ] as ContactLink[],
  },
  meta: {
    title: 'Kaushal — Embedded Systems + Digital Hardware / FPGA-RTL',
    description:
      'Kaushal — BS Electronic Systems (IIT Madras) and B.Tech ECE. Embedded and digital hardware engineer working across firmware, FPGA/RTL, hardware/PCB and semiconductor-oriented digital design.',
  },
};

/* ------------------------------------------------------------------------ */
/* Sections — the spatial journey                                            */
/* ------------------------------------------------------------------------ */

export interface SectionDef {
  id: string;
  label: string;
  steps: number;
  /** Horizontal sections: sideways gestures move between their steps; vertical gestures leave. */
  horizontal?: boolean;
}

export const sections: SectionDef[] = [
  { id: 'origin', label: 'Origin', steps: 1 },
  { id: 'position', label: 'Capabilities', steps: 1 },
  { id: 'domains', label: 'Skill Domains', steps: 9, horizontal: true },
  { id: 'builds', label: 'Projects', steps: 8, horizontal: true },
  { id: 'stack', label: 'Stack', steps: 2 },
  { id: 'directions', label: 'Directions', steps: 1 },
  { id: 'contact', label: 'Contact', steps: 1 },
];

/* ------------------------------------------------------------------------ */
/* 02 — Capabilities: the profile at a glance, in three tiers                */
/* ------------------------------------------------------------------------ */

export interface Tier {
  key: 'core' | 'systems' | 'foundation';
  label: string;
  /** The engineering areas of the tier (primary line). */
  areas: string[];
  /** Representative skills behind those areas (supporting line). */
  detail: string[];
}

export const tiers: Tier[] = [
  {
    key: 'core',
    label: 'Core',
    areas: ['Embedded Systems', 'Digital Hardware', 'FPGA / RTL', 'Embedded Firmware'],
    detail: ['STM32', 'FreeRTOS', 'Interrupts', 'Verilog', 'SystemVerilog', 'Synthesis', 'Timing', 'Verification'],
  },
  {
    key: 'systems',
    label: 'Systems',
    areas: ['Embedded Linux', 'Hardware / PCB', 'DSP', 'Sensors', 'Control / Comms'],
    detail: ['KiCad', 'Hardware Bring-up', 'FIR / IIR', 'IMU', 'PID', 'CAN', 'IoT'],
  },
  {
    key: 'foundation',
    label: 'Foundation',
    areas: ['C', 'C++', 'Python', 'DSA'],
    detail: ['Embedded C', 'C++ STL', 'Bash', 'Tcl', 'Git', 'Linux CLI'],
  },
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
/* 03 — Skill domains: nine cards on the orbit                               */
/* ------------------------------------------------------------------------ */

/** One capability card: a domain and the skills that make it up (all from the dataset). */
export interface Domain {
  name: string;
  /** Display line breaks for the card face. */
  nameLines: string[];
  skills: string[];
}

export const domains: Domain[] = [
  { name: 'Embedded Systems', nameLines: ['Embedded', 'Systems'], skills: ['STM32', 'GPIO', 'Timers', 'ADC', 'PWM', 'Interrupts'] },
  { name: 'Real-Time Firmware', nameLines: ['Real-Time', 'Firmware'], skills: ['Embedded C', 'FreeRTOS', 'Tasks', 'Queues', 'Semaphores', 'CAN'] },
  { name: 'Digital Hardware', nameLines: ['Digital', 'Hardware'], skills: ['Digital System Design', 'Verilog', 'SystemVerilog', 'RTL'] },
  { name: 'FPGA / RTL', nameLines: ['FPGA / RTL'], skills: ['FPGA', 'Simulation', 'Synthesis', 'Constraints', 'Timing'] },
  { name: 'Verification', nameLines: ['Verification'], skills: ['Testbenches', 'Assertions', 'Coverage Concepts', 'AMBA'] },
  { name: 'Hardware / PCB', nameLines: ['Hardware', '/ PCB'], skills: ['KiCad', 'Schematics', 'BOM', 'DRC', 'Power Budgeting', 'Bring-up'] },
  { name: 'Signal Processing', nameLines: ['Signal', 'Processing'], skills: ['Signals & Systems', 'DSP', 'Sampling', 'DFT / FFT', 'FIR / IIR'] },
  { name: 'Sensors · Control · Comms', nameLines: ['Sensors', '· Control · Comms'], skills: ['Sensors', 'IMU', 'Control Systems', 'PID', 'Communication Systems', 'IoT'] },
  { name: 'Embedded Linux & Tools', nameLines: ['Embedded Linux', '& Tools'], skills: ['Embedded Linux', 'Linux CLI', 'Bash', 'Tcl', 'Git', 'Python Automation'] },
];

/* ------------------------------------------------------------------------ */
/* 04 — Builds: eight projects                                               */
/* ------------------------------------------------------------------------ */

export interface Project {
  n: string; // 01..08
  title: string;
  titleLines: string[]; // display line breaks
  domain: string; // the engineering domain this project sits in
  concept: string;
  stack: string[];
  focus: string[];
  /** Short technical mark shown in the outlined badge: the character of the build. */
  mark: string;
  /** Short note shown under concept where it adds context. */
  note?: string;
  extra?: { label: string; items: string[] }[];
  evidence?: { label: string; href: string }[];
}

export const projects: Project[] = [
  {
    n: '01',
    mark: 'Bare-metal C',
    title: 'STM32 UART Echo + LED Control',
    titleLines: ['STM32 UART Echo', '+ LED Control'],
    domain: 'Embedded Firmware',
    concept: 'An embedded firmware project built around an STM32: UART echo communication and GPIO-driven LED control, written in C / Embedded C.',
    stack: ['C', 'Embedded C', 'STM32', 'UART', 'GPIO'],
    focus: ['Firmware fundamentals', 'Debugging'],
  },
  {
    n: '02',
    mark: 'Mixed-signal',
    title: 'Digital Thermometer with Analog Chain',
    titleLines: ['Digital Thermometer', 'with Analog Chain'],
    domain: 'Mixed Analog / Digital',
    concept: 'A mixed analog/digital measurement system: an analog front end feeding a digital controller, with the signal path simulated and verified before bring-up.',
    stack: ['Analog circuits', 'Digital design', 'ADC', 'Verilog controller', 'Display / interface', 'LTspice', 'Testbench', 'Oscilloscope'],
    focus: ['Measurement', 'Analog + digital'],
  },
  {
    n: '03',
    mark: 'Real-time DSP',
    title: 'IMU Logger + Real-Time FIR',
    titleLines: ['IMU Logger', '+ Real-Time FIR'],
    domain: 'Sensing + Signal Processing',
    concept: 'Sensor acquisition joined to embedded signal processing: an IMU/sensor logger over UART / I²C / SPI, feeding a real-time FIR filtering pipeline.',
    stack: ['STM32 peripherals', 'IMU', 'Sensors', 'ADC / interface', 'UART', 'I²C', 'SPI', 'FIR filtering', 'DSP'],
    focus: ['Measurement', 'Debugging', 'Signal processing'],
  },
  {
    n: '04',
    mark: 'Synthesised RTL',
    title: 'FPGA UART Receiver + Display',
    titleLines: ['FPGA UART Receiver', '+ Display'],
    domain: 'Digital Hardware / FPGA-RTL',
    concept: 'A digital hardware project in Verilog/RTL: a UART receiver and display subsystem taken from simulation through synthesis, constraints, timing and FPGA bring-up.',
    stack: ['FPGA', 'Verilog', 'RTL', 'UART', 'Display subsystem', 'Simulation', 'Synthesis', 'Constraints', 'Timing'],
    focus: ['FPGA bring-up', 'Linux / MCU interface'],
  },
  {
    n: '05',
    mark: 'Closed-loop RTOS',
    title: 'FreeRTOS Multi-Sensor + PID Node',
    titleLines: ['FreeRTOS Multi-Sensor', '+ PID Node'],
    domain: 'Real-Time Systems',
    concept: 'A real-time embedded control node: multiple sensors coordinated under FreeRTOS with closed-loop PID control, exercised through Python test automation.',
    stack: ['FreeRTOS', 'Tasks', 'Queues', 'Semaphores', 'Timers', 'Interrupts', 'CAN', 'PID', 'Python test automation', 'C++'],
    focus: ['Control systems', 'Real-time design'],
  },
  {
    n: '06',
    mark: 'Board-level',
    title: 'Custom STM32 Sensor PCB',
    titleLines: ['Custom STM32', 'Sensor PCB'],
    domain: 'Hardware / PCB',
    concept: 'A custom STM32 sensor board designed in KiCad — schematic, PCB layout, BOM and DRC — then carried through power budgeting, protection and hardware bring-up.',
    stack: ['KiCad', 'Schematics', 'PCB design', 'BOM', 'DRC', 'Power budgeting', 'Decoupling', 'Protection'],
    focus: ['Instrumentation', 'Oscilloscope', 'Logic analyzer', 'Hardware bring-up', 'Measurement', 'Revision'],
  },
  {
    n: '07',
    mark: 'Testbench-verified',
    title: 'RTL SPI / UART-FIFO + Testbench',
    titleLines: ['RTL SPI / UART-FIFO', '+ Testbench'],
    domain: 'RTL + Verification',
    concept: 'RTL and verification work in SystemVerilog: SPI and UART-FIFO blocks exercised by a self-checking testbench with assertions and coverage concepts.',
    stack: ['SystemVerilog', 'RTL', 'SPI', 'UART / FIFO', 'Testbenches', 'Assertions', 'Coverage concepts', 'AMBA', 'Scripting', 'Synthesis', 'Timing'],
    focus: ['Verification', 'Digital IC design'],
  },
  {
    n: '08',
    mark: 'System-level',
    title: 'Flagship Integrated System',
    titleLines: ['Flagship', 'Integrated System'],
    domain: 'System Integration',
    concept: 'An integrated system drawing together the strongest capabilities across the profile — embedded firmware, digital hardware, FPGA/RTL, PCB and communication — into one build.',
    stack: ['STM32', 'FPGA', 'FreeRTOS', 'PCB', 'Embedded systems', 'Digital hardware', 'Communication', 'System integration'],
    focus: ['System integration'],
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

/** Joints: where two capability groups meet. Derived only from the items above. */
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
