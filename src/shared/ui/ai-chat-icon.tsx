import Svg, { Path } from "react-native-svg";

/**
 * A speech bubble with an AI sparkle, used wherever the local AI chat is
 * opened. Drawn as a stroke so it reads well at small sizes.
 */
export function AIChatIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5c-4.97 0-9 3.36-9 7.5 0 2.2 1.14 4.18 2.96 5.55-.18 1.3-.77 2.5-1.7 3.45 1.9.1 3.64-.46 4.94-1.44.9.2 1.83.3 2.8.3 4.97 0 9-3.36 9-7.5S16.97 3.5 12 3.5Z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path
        d="M12 6.9c.28 1.66 1.1 2.48 2.76 2.76-1.66.28-2.48 1.1-2.76 2.76-.28-1.66-1.1-2.48-2.76-2.76 1.66-.28 2.48-1.1 2.76-2.76Z"
        fill={color}
      />
      <Path
        d="M16.2 11.6c.13.77.51 1.15 1.28 1.28-.77.13-1.15.51-1.28 1.28-.13-.77-.51-1.15-1.28-1.28.77-.13 1.15-.51 1.28-1.28Z"
        fill={color}
      />
    </Svg>
  );
}
