import { CSSProperties } from "react";

type HermesLogoProps = {
  size?: number;
  className?: string;
};

function HermesLogo({ size = 32, className = "" }: HermesLogoProps): React.JSX.Element {
  const style = {
    "--yat-logo-size": `${size}px`,
  } as CSSProperties;

  return (
    <div
      className={`yat-logo ${className}`.trim()}
      style={style}
      aria-label="Yat"
      role="img"
    >
      <span className="yat-logo-word">yat</span>
    </div>
  );
}

export default HermesLogo;
