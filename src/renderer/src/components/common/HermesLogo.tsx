import icon from "../../assets/icon.png";

function HermesLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <div
      className="yat-logo"
      style={{ width: size, height: size, borderRadius: Math.max(8, size / 4) }}
      aria-label="Yat"
    >
      <img src={icon} width={size} height={size} alt="" />
    </div>
  );
}

export default HermesLogo;
