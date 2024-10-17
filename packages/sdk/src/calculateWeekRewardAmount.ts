import { moneriumEureToken, moneriumGbpToken, usdcBridgeToken, circleUsdcToken } from './gnoisPayTokens';
import { Address, getAddress } from 'viem';

/**
 * The month-to-date USD volume threshold for each currency.
 * A maximum of EUR 20,000, USD 22,000, or GBP 18,000 will be eligible to accrue rewards per month for every user.
 */
const FOUR_WEEK_VOLUME_THRESHOLD = {
  // USDC can be either circle's native USDC or bridged from Ethereum
  [getAddress(circleUsdcToken.address)]: 22_000,
  [getAddress(usdcBridgeToken.address)]: 22_000,
  [getAddress(moneriumGbpToken.address)]: 18_000,
  [getAddress(moneriumEureToken.address)]: 20_000,
};

/**
 * Get the four week volume threshold for a given safe token address.
 * @param safeToken - The safe token address to get the threshold for.
 * @returns The four week volume threshold for the given safe token address.
 * The threshold is in the same currency as the safe token, and must be converted to USD before using it in the reward calculation.
 */
export function getFourWeekVolumeThreshold(safeToken: Address): number {
  const safeTokenAddress = getAddress(safeToken);
  const volumeThreshold = FOUR_WEEK_VOLUME_THRESHOLD[safeTokenAddress];
  if (volumeThreshold === undefined) {
    throw new Error(`Invalid safe token address: ${safeTokenAddress}`);
  }
  return volumeThreshold;
}

type CalculateWeekRewardCommonParams = {
  /**
   * The GNO USD price reference to use when calculating rewards
   */
  gnoUsdPrice: number;
  /**
   * Whether the user is an Gnois Pay OG NFT holder. This adds 1% to the reward percentage.
   * See [https://gnosispay.niftyfair.io/](https://gnosispay.niftyfair.io/)
   */
  isOgNftHolder: boolean;
  /**
   * The net USD volume for the week
   */
  weekUsdVolume: number;
  /**
   * The GNO balance for the week
   */
  gnoBalance: number;
  /**
   * Four weeks USD volume
   */
  fourWeeksUsdVolume: number;
  /**
   * The four week USD volume threshold for the safe token.
   * Use `getFourWeekVolumeThreshold` and convert that to USD before passing it in here.
   */
  fourWeeksUsdVolumeThreshold: number;
};

/**
 * Calculate the rewards for a given week given the net USD volume and GNO balance.
 * Negative USD volumes are ignored as they don't contribute to the rewards.
 */
export function calculateWeekRewardAmount({
  gnoUsdPrice,
  isOgNftHolder,
  gnoBalance,
  weekUsdVolume,
  fourWeeksUsdVolume,
  fourWeeksUsdVolumeThreshold,
}: CalculateWeekRewardCommonParams): number {
  if (gnoUsdPrice <= 0) {
    throw new Error('gnoUsdPrice must be greater than 0');
  }

  if (fourWeeksUsdVolumeThreshold <= 0) {
    throw new Error('fourWeeksUsdVolumeThreshold must be greater than 0');
  }

  // safeCurrency volume threshold - four-week volume + 1-week
  const netVolume = fourWeeksUsdVolumeThreshold - fourWeeksUsdVolume + weekUsdVolume;
  // If the month-to-date USD volume is greater than the threshold, the user is eligible for the OG NFT holder reward
  if (netVolume >= fourWeeksUsdVolumeThreshold) {
    return 0;
  }

  // Calculate base reward percentage based on GNO holdings
  let rewardPercentage = 0;
  if (gnoBalance >= 100) {
    rewardPercentage = 4;
  } else if (gnoBalance >= 10) {
    rewardPercentage = 3 + (gnoBalance - 10) / 90;
  } else if (gnoBalance >= 1) {
    rewardPercentage = 2 + (gnoBalance - 1) / 9;
  } else if (gnoBalance >= 0.1) {
    rewardPercentage = 1 + (gnoBalance - 0.1) / 0.9;
  } else {
    rewardPercentage = 0; // Not eligible for rewards
  }

  // Add OG GP NFT holder boost if applicable
  if (isOgNftHolder && gnoBalance >= 0.1) {
    rewardPercentage += 1;
  }

  // Calculate GNO rewards
  const gnoRewards = ((rewardPercentage / 100) * weekUsdVolume) / gnoUsdPrice;

  return gnoRewards;
}
