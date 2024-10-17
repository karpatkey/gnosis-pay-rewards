import { moneriumEureToken, moneriumGbpToken, usdcBridgeToken, circleUsdcToken } from './gnoisPayTokens';
import { Address, getAddress } from 'viem';

/**
 * The month-to-date USD volume threshold for each currency.
 * A maximum of EUR 20,000, USD 22,000, or GBP 18,000 will be eligible to accrue rewards per month for every user.
 */
const MONTH_TO_DATE_USD_VOLUME_THRESHOLD = {
  // USDC can be either circle's native USDC or bridged from Ethereum
  [circleUsdcToken.address]: 22_000,
  [usdcBridgeToken.address]: 22_000,
  [moneriumGbpToken.address]: 18_000,
  [moneriumEureToken.address]: 20_000,
};

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
   * The address of the safe token to use when calculating rewards.
   * If not provided, the rewards will be calculated based on the USD volume.
   */
  safeToken?: Address;
};

/**
 * Calculate the rewards for a given week given the net USD volume and GNO balance.
 * Negative USD volumes are ignored as they don't contribute to the rewards.
 */
export function calculateWeekRewardAmount({
  gnoUsdPrice,
  isOgNftHolder,
  weekUsdVolume,
  gnoBalance,
  fourWeeksUsdVolume,
  safeToken,
}: CalculateWeekRewardCommonParams): number {
  if (gnoUsdPrice <= 0) {
    throw new Error('gnoUsdPrice must be greater than 0');
  }

  // Determine the threshold based on the safe token address
  const safeTokenAddress = getAddress(safeToken ?? circleUsdcToken.address);
  const volumeThreshold = MONTH_TO_DATE_USD_VOLUME_THRESHOLD[safeTokenAddress];

  if (volumeThreshold === undefined) {
    throw new Error(`Invalid safe token address: ${safeTokenAddress}`);
  }

  // safeCurrency volume threshold - four-week volume + 1-week
  const netVolume = volumeThreshold - fourWeeksUsdVolume + weekUsdVolume;
  // If the month-to-date USD volume is greater than the threshold, the user is eligible for the OG NFT holder reward
  if (netVolume >= volumeThreshold) {
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
