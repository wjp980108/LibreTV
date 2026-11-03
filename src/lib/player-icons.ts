import type { IconDefinition } from '@ant-design/icons-svg/es/types';
import { renderIconDefinitionToSVGElement } from '@ant-design/icons-svg/es/helpers';
import CaretRightFilled from '@ant-design/icons-svg/es/asn/CaretRightFilled';
import PauseOutlined from '@ant-design/icons-svg/es/asn/PauseOutlined';
import PlayCircleOutlined from '@ant-design/icons-svg/es/asn/PlayCircleOutlined';
import LoadingOutlined from '@ant-design/icons-svg/es/asn/LoadingOutlined';
import CheckOutlined from '@ant-design/icons-svg/es/asn/CheckOutlined';
import SoundOutlined from '@ant-design/icons-svg/es/asn/SoundOutlined';
import MutedOutlined from '@ant-design/icons-svg/es/asn/MutedOutlined';
import CameraOutlined from '@ant-design/icons-svg/es/asn/CameraOutlined';
import SettingOutlined from '@ant-design/icons-svg/es/asn/SettingOutlined';
import PictureOutlined from '@ant-design/icons-svg/es/asn/PictureOutlined';
import LeftOutlined from '@ant-design/icons-svg/es/asn/LeftOutlined';
import RightOutlined from '@ant-design/icons-svg/es/asn/RightOutlined';
import DashboardOutlined from '@ant-design/icons-svg/es/asn/DashboardOutlined';
import ExpandOutlined from '@ant-design/icons-svg/es/asn/ExpandOutlined';
import LockOutlined from '@ant-design/icons-svg/es/asn/LockOutlined';
import UnlockOutlined from '@ant-design/icons-svg/es/asn/UnlockOutlined';
import SwapOutlined from '@ant-design/icons-svg/es/asn/SwapOutlined';
import FullscreenOutlined from '@ant-design/icons-svg/es/asn/FullscreenOutlined';
import FullscreenExitOutlined from '@ant-design/icons-svg/es/asn/FullscreenExitOutlined';
import CloseOutlined from '@ant-design/icons-svg/es/asn/CloseOutlined';
import WarningOutlined from '@ant-design/icons-svg/es/asn/WarningOutlined';
import DesktopOutlined from '@ant-design/icons-svg/es/asn/DesktopOutlined';
import StepBackwardOutlined from '@ant-design/icons-svg/es/asn/StepBackwardOutlined';
import StepForwardOutlined from '@ant-design/icons-svg/es/asn/StepForwardOutlined';
import DoubleLeftOutlined from '@ant-design/icons-svg/es/asn/DoubleLeftOutlined';
import DoubleRightOutlined from '@ant-design/icons-svg/es/asn/DoubleRightOutlined';

// ArtPlayer accepts HTML strings rather than React elements. Use Ant Design's
// official asset renderer for this SDK boundary; no handwritten SVG paths.
const svg = (icon: IconDefinition) =>
  renderIconDefinitionToSVGElement(icon, {
    extraSVGAttrs: { width: '22', height: '22', fill: 'currentColor', 'aria-hidden': 'true' },
  });

const definitions = {
  loading: LoadingOutlined,
  state: PlayCircleOutlined,
  play: CaretRightFilled,
  pause: PauseOutlined,
  check: CheckOutlined,
  volume: SoundOutlined,
  volumeClose: MutedOutlined,
  screenshot: CameraOutlined,
  setting: SettingOutlined,
  pip: PictureOutlined,
  arrowLeft: LeftOutlined,
  arrowRight: RightOutlined,
  playbackRate: DashboardOutlined,
  aspectRatio: ExpandOutlined,
  config: SettingOutlined,
  lock: LockOutlined,
  unlock: UnlockOutlined,
  flip: SwapOutlined,
  fullscreenOn: FullscreenOutlined,
  fullscreenOff: FullscreenExitOutlined,
  fullscreenWebOn: ExpandOutlined,
  fullscreenWebOff: FullscreenExitOutlined,
  switchOn: CheckOutlined,
  switchOff: CloseOutlined,
  error: WarningOutlined,
  close: CloseOutlined,
  airplay: DesktopOutlined,
};

export const playerIcons = Object.fromEntries(
  Object.entries(definitions).map(([name, definition]) => [name, svg(definition)]),
);
export const previousEpisodeIcon = svg(StepBackwardOutlined);
export const nextEpisodeIcon = svg(StepForwardOutlined);
export const previousChannelIcon = svg(DoubleLeftOutlined);
export const nextChannelIcon = svg(DoubleRightOutlined);
