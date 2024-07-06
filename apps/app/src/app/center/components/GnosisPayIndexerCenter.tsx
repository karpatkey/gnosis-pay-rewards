'use client';
import { SpendTransactionFieldsTypePopulated, WeekSnapshotDocumentFieldsType } from '@karpatkey/gnosis-pay-rewards-sdk';
import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import dayjsrelativeTime from 'dayjs/plugin/relativeTime';
import { Container } from 'ui/components/Container';
import { toast } from 'sonner';
import { gnosisPayRewardsIndexerSocket as socket } from '../socket';
import { RecentSpendTransactionsTable } from './RecentSpendTransactionsTable';
import {
  VolumeThisWeekWidget,
  CurrentWeekWidget,
  CurrentOwlsThisWeekWidget,
  EstiamtedPayoutThisWeekWidget,
} from './widgets';
dayjs.extend(dayjsrelativeTime);

const connectionTimeoutSeconds = 5;

export function GnosisPayIndexerCenter() {
  const [connectAttempts, setConnectAttempts] = useState(0);
  const [connectionTimeout, setConnectionTimeout] = useState<NodeJS.Timeout | null>(null);
  const [recentSpendTransactions, setRecentSpendTransactions] = useState<SpendTransactionFieldsTypePopulated[]>([]);
  const [currentWeekData, setCurrentWeekData] = useState<WeekSnapshotDocumentFieldsType | null>(null);

  const onConnectHandler = useCallback(() => {
    console.log('Connected to server, emitting getRecentSpendTransactions');
    socket.emit('getRecentSpendTransactions', 10);
    socket.emit('getCurrentWeekData');
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    setConnectionTimeout(null);
    toast('Connected to the indexer', {});
  }, []);

  const onDisconnectHandler = useCallback(() => {
    setConnectAttempts(0);
    setConnectionTimeout(null);
    toast('Disconnected from the indexer', {});
  }, []);

  const onNewSpendTransactionHandler = useCallback((newSpendTransaction: SpendTransactionFieldsTypePopulated) => {
    setRecentSpendTransactions((prev) => {
      // Make sure the new spend transaction is not already in the list
      if (
        prev.some((spendTransaction) => spendTransaction._id.toLowerCase() === newSpendTransaction._id.toLowerCase())
      ) {
        return prev;
      }

      const nextChunk = [newSpendTransaction, ...prev].sort((a, b) => {
        // Sort descending by block number
        return b.blockNumber - a.blockNumber;
      });

      return nextChunk;
    });
  }, []);

  const onCurrentWeekDataUpdatedHandler = useCallback((currentWeekData: WeekSnapshotDocumentFieldsType) => {
    setCurrentWeekData(currentWeekData);
  }, []);

  useEffect(() => {
    socket.on('connect', onConnectHandler);
    socket.on('disconnect', onDisconnectHandler);
    socket.on('recentSpendTransactions', (recentSpendTransactions) => {
      console.log({ recentSpendTransactions });
      setRecentSpendTransactions(recentSpendTransactions);
    });
    socket.on('currentWeekData', (currentWeekData) => {
      console.log({ currentWeekData });
      setCurrentWeekData(currentWeekData);
    });
    socket.on('newSpendTransaction', onNewSpendTransactionHandler);
    socket.on('currentWeekDataUpdated', onCurrentWeekDataUpdatedHandler);
    socket.on('connect_error', (error) => {
      console.error('connect_error', error);

      const nextConnectAttempts = connectAttempts + 1;
      const nextWaitTimeSeconds = nextConnectAttempts * connectionTimeoutSeconds;

      setConnectAttempts(nextConnectAttempts);

      // Remove old timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      setConnectionTimeout(
        setTimeout(() => {
          socket.connect();
        }, nextWaitTimeSeconds * 1_000),
      );

      toast(`Error connecting to the server, retrying in ${nextWaitTimeSeconds}s`, {});
    });

    // Immediately try to connect to the server
    socket.connect();

    return () => {
      socket.off('connect', onConnectHandler);
      socket.off('disconnect', onDisconnectHandler);
      socket.off('newSpendTransaction', onNewSpendTransactionHandler);
      socket.off('currentWeekDataUpdated', onCurrentWeekDataUpdatedHandler);
    };
  }, [onConnectHandler, onDisconnectHandler, onNewSpendTransactionHandler, onCurrentWeekDataUpdatedHandler]);

  return (
    <Container
      style={{
        marginTop: '20px',
      }}
    >
      <header className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr] pb-4">
        <VolumeThisWeekWidget volume={currentWeekData?.totalUsdVolume} />
        <CurrentWeekWidget currentWeek={currentWeekData?.date} />
        <CurrentOwlsThisWeekWidget />
        <EstiamtedPayoutThisWeekWidget />
      </header>
      <section className="flex flex-col lg:flex-row justify-between gap-4"></section>
      {recentSpendTransactions.length > 0 ? (
        <div className="mb-4">
          <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-4">Recent GP Transactions</h3>
          <RecentSpendTransactionsTable data={recentSpendTransactions} />
        </div>
      ) : null}
    </Container>
  );
}
