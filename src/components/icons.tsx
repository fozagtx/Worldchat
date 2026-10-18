const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Mic = () => (<svg {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const MicOff = () => (<svg {...base}><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>);
export const Cam = () => (<svg {...base}><rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10.5l5-3v9l-5-3" /></svg>);
export const CamOff = () => (<svg {...base}><path d="M3 3l18 18M7 6h6a3 3 0 0 1 3 3v4M16 16a3 3 0 0 1-3 2H6a3 3 0 0 1-3-3V9a3 3 0 0 1 1.5-2.6M16 10.5l5-3v9l-3-1.8" /></svg>);
export const Phone = () => (<svg {...base}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>);
export const PhoneDown = () => (<svg {...base}><path d="M3 15.5c5-5 13-5 18 0l-2.5 2.5-3.5-1.5v-2.5a10 10 0 0 0-6 0v2.5L5.5 18z" /></svg>);
export const Search = () => (<svg {...base} width={16} height={16}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const LinkIcon = () => (<svg {...base} width={16} height={16}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const Locate = () => (<svg {...base} width={16} height={16}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></svg>);
export const Close = () => (<svg {...base} width={16} height={16}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Arrow = () => (<svg {...base} width={16} height={16}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
    <circle cx="16" cy="16" r="14" fill="#2b1d14" />
    <ellipse cx="16" cy="16" rx="6" ry="14" stroke="#f4ede3" strokeWidth="1.6" />
    <path d="M3 16h26M5.5 9h21M5.5 23h21" stroke="#f4ede3" strokeWidth="1.6" />
  </svg>
);
