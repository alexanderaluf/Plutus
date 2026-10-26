import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

// Google Gemini mark. Vector source: Lobe Icons (MIT; docs/licenses/lobe-icons.txt).
// https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/gemini-color.svg
// The Gemini/Google trademarks belong to Google.
const GEMINI_MARK = "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";

export function GeminiLogo({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Defs>
        <LinearGradient id={`${id}-green`} gradientUnits="userSpaceOnUse" x1="7" x2="11" y1="15.5" y2="12">
          <Stop stopColor="#08B962" />
          <Stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${id}-red`} gradientUnits="userSpaceOnUse" x1="8" x2="11.5" y1="5.5" y2="11">
          <Stop stopColor="#F94543" />
          <Stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${id}-yellow`} gradientUnits="userSpaceOnUse" x1="3.5" x2="17.5" y1="13.5" y2="12">
          <Stop stopColor="#FABC12" />
          <Stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={GEMINI_MARK} fill="#3186FF" />
      <Path d={GEMINI_MARK} fill={`url(#${id}-green)`} />
      <Path d={GEMINI_MARK} fill={`url(#${id}-red)`} />
      <Path d={GEMINI_MARK} fill={`url(#${id}-yellow)`} />
    </Svg>
  );
}
