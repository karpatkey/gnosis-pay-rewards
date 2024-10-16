import {
  createGnosisTokenBalanceSnapshotDocument,
  createGnosisTokenBalanceSnapshotModel,
  createWeekRewardsSnapshotDocument,
  GnosisPaySafeAddressModelType,
  GnosisTokenBalanceSnapshotModelType,
  WeekCashbackRewardModelType,
} from '@karpatkey/gnosis-pay-rewards-sdk/mongoose';
import { gnoToken, toWeekId, getTokenBalanceOf } from '@karpatkey/gnosis-pay-rewards-sdk';
import { Address, formatUnits } from 'viem';

import { GnosisChainPublicClient } from './types';
import { getGnosisTokenTransferLogs } from '../gp/getGnosisTokenTransferLogs.js';
import { isGnosisPaySafeAddress } from '../gp/isGnosisPaySafeAddress.js';
import { getBlockByNumber } from './actions.js';

type MongooseModels = {
  gnosisPaySafeAddressModel: GnosisPaySafeAddressModelType;
  gnosisTokenBalanceSnapshotModel: GnosisTokenBalanceSnapshotModelType;
  weekCashbackRewardModel: WeekCashbackRewardModelType;
};

export async function processGnosisTokenTransferLog({
  client,
  log,
  mongooseModels,
}: {
  client: GnosisChainPublicClient;
  log: Awaited<ReturnType<typeof getGnosisTokenTransferLogs>>[number];
  mongooseModels: MongooseModels;
}) {
  try {
    const { blockNumber, transactionHash } = log;
    const { gnosisPaySafeAddressModel, gnosisTokenBalanceSnapshotModel, weekCashbackRewardModel } = mongooseModels;
    const { from, to } = log.args;

    // Validate that the log has not already been processed
    await validateLogIsNotAlreadyProcessed(mongooseModels.gnosisTokenBalanceSnapshotModel, transactionHash);

    const [isSenderGnosisPaySafe, isReceiverGnosisPaySafe] = await Promise.all(
      [from, to].map((address) =>
        isGnosisPaySafeAddress({
          address,
          client,
          gnosisPaySafeAddressModel,
        }).then(({ isGnosisPaySafe }) => isGnosisPaySafe),
      ),
    );

    // If either the sender or receiver is a Gnosis Pay Safe,
    // take a snapshot of the Gnosis Pay Safe's balance
    if (!isSenderGnosisPaySafe && !isReceiverGnosisPaySafe) {
      throw new Error('Neither sender nor receiver is a Gnosis Pay Safe');
    }

    const safeAddress = (isSenderGnosisPaySafe ? from : to).toLowerCase() as Address;

    const gnosisTokenBalanceSnapshotDocument = await takeGnosisTokenBalanceSnapshot({
      gnosisTokenBalanceSnapshotModel,
      weekCashbackRewardModel,
      gnosisPaySafeAddressModel,
      safeAddress,
      client,
      blockNumber,
    });

    return {
      data: gnosisTokenBalanceSnapshotDocument.toJSON(),
      error: null,
    };
  } catch (e) {
    return {
      data: null,
      error: e as Error,
    };
  }
}

async function validateLogIsNotAlreadyProcessed(
  gnosisTokenBalanceSnapshotModel: ReturnType<typeof createGnosisTokenBalanceSnapshotModel>,
  transactionHash: string,
) {
  const existing = await gnosisTokenBalanceSnapshotModel.findById(transactionHash);
  if (existing) {
    throw new Error('Log already processed');
  }
}

export async function takeGnosisTokenBalanceSnapshot({
  gnosisTokenBalanceSnapshotModel,
  weekCashbackRewardModel,
  gnosisPaySafeAddressModel,
  safeAddress,
  blockNumber,
  client,
}: MongooseModels & {
  safeAddress: Address;
  client: GnosisChainPublicClient;
  blockNumber?: bigint;
}) {
  blockNumber = blockNumber ?? (await client.getBlockNumber());

  const block = await getBlockByNumber({
    blockNumber,
    client,
    useCache: true,
  });

  const gnoBalanceRaw = await getTokenBalanceOf({
    token: gnoToken.address,
    address: safeAddress,
    client,
    blockNumber,
  });

  const weekId = toWeekId(block.timestamp);

  const mongooseSession = await gnosisTokenBalanceSnapshotModel.startSession();
  mongooseSession.startTransaction();

  // Create the Gnosis Token Balance Snapshot document
  const gnosisTokenBalanceSnapshotDocument = await createGnosisTokenBalanceSnapshotDocument(
    gnosisTokenBalanceSnapshotModel,
    {
      blockNumber: Number(block.number),
      safe: safeAddress,
      balance: Number(formatUnits(gnoBalanceRaw, gnoToken.decimals)),
      balanceRaw: gnoBalanceRaw.toString(),
      blockTimestamp: Number(block.timestamp),
      weekId,
    },
    mongooseSession,
  );

  // Create or load the Week Cashback Reward document
  // to append the new balance snapshot to
  const weekCashbackRewardDocument = await createWeekRewardsSnapshotDocument(
    weekCashbackRewardModel,
    weekId,
    safeAddress,
    mongooseSession,
  );

  // Find other balance snapshots in the same week for the safe
  const weekGnoBalanceSnapshotDocuments = await gnosisTokenBalanceSnapshotModel.find(
    {
      safe: safeAddress,
      weekId,
    },
    { balance: 1 },
    { session: mongooseSession },
  );

  // Append the new gnoBalanceSnapshot to the weekCashbackRewardDocument
  weekCashbackRewardDocument.gnoBalanceSnapshots.push(gnosisTokenBalanceSnapshotDocument.id);

  if (weekGnoBalanceSnapshotDocuments.length > 0) {
    const minGnoBalance = weekGnoBalanceSnapshotDocuments[0].balance;

    const maxGnoBalance = weekGnoBalanceSnapshotDocuments[weekGnoBalanceSnapshotDocuments.length - 1].balance;

    weekCashbackRewardDocument.minGnoBalance = minGnoBalance;
    weekCashbackRewardDocument.maxGnoBalance = maxGnoBalance;
  }

  await weekCashbackRewardDocument.save({ session: mongooseSession });

  // Update the Gnosis Pay Safe's gnoBalanceSnapshots
  await gnosisPaySafeAddressModel.updateOne(
    { _id: safeAddress },
    {
      $push: {
        gnoBalanceSnapshots: gnosisTokenBalanceSnapshotDocument.id,
      },
    },
    { session: mongooseSession },
  );

  await mongooseSession.commitTransaction();
  await mongooseSession.endSession();

  return gnosisTokenBalanceSnapshotDocument;
}
