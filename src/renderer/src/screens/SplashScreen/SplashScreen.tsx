import { useEffect } from "react";
import HermesLogo from "../../components/common/HermesLogo";

interface SplashScreenProps {
  onFinished: () => void;
}

function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  useEffect(() => {
    onFinished();
  }, [onFinished]);

  return (
    <div className="splash-screen">
      <div className="splash-orb splash-orb-one" />
      <div className="splash-orb splash-orb-two" />
      <div className="splash-grid" />
      <div className="splash-card" aria-label="Yat Studio is starting">
        <HermesLogo size={92} className="splash-mark" />
        <div className="splash-wordmark">Yat Studio</div>
        <div className="splash-tagline">desktop AI workspace</div>
        <div className="splash-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
