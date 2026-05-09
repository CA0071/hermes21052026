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
    <img
      className={`yat-logo ${className}`.trim()}
      style={style}
      src="./assets/yat-icon.png"
      alt="Yat Studio"
      aria-label="Yat Studio"
    />
  );
}

export default HermesLogo;
