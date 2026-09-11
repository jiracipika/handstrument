/**
 * Setup-angle diagrams: how to position your device + body for reliable hand
 * tracking, per device class. Pure SVG, no assets — mirrors the app's
 * skeleton-glyph aesthetic (stroke-only figures, cyan accents).
 */

type Device = 'laptop' | 'desktop' | 'phone' | 'tablet';

const DEVICES: { id: Device; label: string; hint: string }[] = [
  { id: 'laptop', label: 'Laptop', hint: 'Screen open ~100°, hands 30–50 cm from the camera, well below the screen edge.' },
  { id: 'desktop', label: 'Desktop', hint: 'Webcam at eye level or slightly below. Sit back so both hands stay in frame.' },
  { id: 'phone', label: 'Phone', hint: 'Prop it at ~45° leaning on something, camera facing your torso — not flat on a table.' },
  { id: 'tablet', label: 'Tablet / iPad', hint: 'In a case or stand at ~60°. Farthest of all devices — keep hands inside the frame edges.' },
];

function Diagram({ device }: { device: Device }) {
  // Side view: person on the left, device on the right, sight cone from camera.
  const stroke = 'rgba(255,255,255,0.55)';
  const accent = '#22d3ee';
  const soft = 'rgba(34,211,238,0.14)';
  return (
    <svg viewBox="0 0 200 120" className="setup-diagram" role="img" aria-label={`${device} setup side view`}>
      {/* camera sight cone */}
      <polygon points="150,38 78,26 78,72" fill={soft} />
      {/* camera ray center */}
      <line x1="150" y1="38" x2="70" y2="46" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      {/* person: head, torso, arm + hand in cone */}
      <circle cx="34" cy="42" r="9" fill="none" stroke={stroke} strokeWidth="2" />
      <line x1="34" y1="51" x2="34" y2="88" stroke={stroke} strokeWidth="2" />
      {/* arm reaching up-forward, hand inside the cone */}
      <path d="M34 62 Q 52 58 62 50" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx="64" cy="49" r="4.5" fill={accent} />
      {/* device, shape varies */}
      {device === 'laptop' && (
        <>
          <line x1="132" y1="88" x2="168" y2="88" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="150" y1="88" x2="150" y2="20" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="150" cy="36" r="2" fill={accent} />
          <path d="M150 24 Q 162 24 164 40" fill="none" stroke={stroke} strokeWidth="1" opacity="0.5" />
        </>
      )}
      {device === 'desktop' && (
        <>
          <rect x="134" y="14" width="34" height="24" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          <line x1="140" y1="38" x2="140" y2="88" stroke={stroke} strokeWidth="1.5" />
          <line x1="132" y1="88" x2="172" y2="88" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="141" cy="38" r="2" fill={accent} />
        </>
      )}
      {device === 'phone' && (
        <>
          <rect x="142" y="56" width="16" height="32" rx="3" transform="rotate(-45 150 72)" fill="none" stroke={stroke} strokeWidth="2" />
          <circle cx="149" cy="61" r="1.8" fill={accent} />
        </>
      )}
      {device === 'tablet' && (
        <>
          <rect x="138" y="46" width="26" height="40" rx="3" transform="rotate(-30 151 66)" fill="none" stroke={stroke} strokeWidth="2" />
          <circle cx="146" cy="53" r="1.8" fill={accent} />
        </>
      )}
      {/* ground line */}
      <line x1="8" y1="88" x2="192" y2="88" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* hand tracking callout */}
      {device !== 'desktop' && (
        <text x="70" y="108" fontSize="8.5" fill="rgba(255,255,255,0.45)" textAnchor="middle">
          hands here
        </text>
      )}
      {device === 'desktop' && (
        <text x="70" y="108" fontSize="8.5" fill="rgba(255,255,255,0.45)" textAnchor="middle">
          sit back a little
        </text>
      )}
    </svg>
  );
}

/** Four-tabbed setup guide with side-view diagrams. */
export default function SetupDiagrams() {
  return (
    <div className="hs-card flex flex-col gap-3 p-3">
      <span className="hs-label">Camera angle per device</span>
      <div className="grid grid-cols-2 gap-3">
        {DEVICES.map((d) => (
          <div key={d.id} className="flex flex-col gap-1.5">
            <Diagram device={d.id} />
            <strong className="text-xs text-white/80">{d.label}</strong>
            <p className="text-[10.5px] leading-relaxed text-white/50">{d.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-[10.5px] leading-relaxed text-white/40">
        The camera needs to see your whole hand: fingers spread toward it, no strong light
        behind you. If tracking flickers, raise your hands closer to the camera.
      </p>
    </div>
  );
}
