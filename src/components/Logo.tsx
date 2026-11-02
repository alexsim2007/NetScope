import mark from '../assets/mark.png';
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img className="app-logo" src={mark} alt="" width={size} height={size} draggable={false} />
  );
}
