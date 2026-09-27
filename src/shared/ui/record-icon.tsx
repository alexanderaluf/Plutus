import Svg, { Path } from "react-native-svg";

import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

import { ICONS } from "@/shared/icons/icon-options";

const curatedIconNames = new Set<string>(
  ICONS.filter((icon) => !icon.name.startsWith("material:")).map(
    (icon) => icon.name,
  ),
);

export type IconSelection = {
  name: string;
  pathData: string | null;
};

type RecordIconProps = {
  color: string;
  name: string;
  pathData?: string | null;
  size: number;
};

export function RecordIcon({ color, name, pathData, size }: RecordIconProps) {
  if (name.startsWith("material:") && pathData) {
    return (
      <Svg height={size} viewBox="0 -960 960 960" width={size}>
        <Path d={pathData} fill={color} />
      </Svg>
    );
  }

  const curatedName = curatedIconNames.has(name)
    ? (name as FilledIconName)
    : "bank";

  return <FilledIcon color={color} name={curatedName} size={size} />;
}
