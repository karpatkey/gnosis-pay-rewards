export enum ChainId {
  GNOSIS_MAINNET = 100,
}

/**
 * Gnosis Pay Spend Address: the address that receives EURe, GBP and USDC from other GP Safes
 */
export const gnosisPaySpendAddress = '0x4822521E6135CD2599199c83Ea35179229A172EE' as const;

/**
 * Gnosis Pay Spender Module Address
 */
export const gnosisPaySpenderModuleAddress = '0xcFF260bfbc199dC82717494299b1AcADe25F549b' as const;

/**
 * GNO token address on Gnosis Chain
 */
export const gnoTokenAddress = '0x9c58bacc331c9aa871afd802db6379a98e80cedb' as const;

/**
 * Gnosis Pay Reward Distribution Safe Address.
 * The safe from which rewards are distributed to other safes.
 */
export const gnosisPayRewardDistributionSafeAddress = '0xCdF50be9061086e2eCfE6e4a1BF9164d43568EEC' as const;

/**
 * Gnosis Pay start block, use this for indexing Gnosis Pay events.
 * This block https://gnosisscan.io/block/35536000
 * Aug-18-2024 12:00:35 AM +UTC
 */
export const gnosisPayStartBlock = 35_536_000n;


/**
 * Gnosis Pay OG NFT address
 */
export const gnosisPayOgNftAddress = '0x88997988a6A5aAF29BA973d298D276FE75fb69ab' as const;
