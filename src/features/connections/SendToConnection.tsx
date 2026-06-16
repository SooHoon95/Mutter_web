// SendToConnection — 연결된 사람을 골라 편지를 직접 발송한다(상대 받은 편지함으로).
// ConnectionPicker로 수신자를 선택하고 "보내기"로 sendToConnection을 호출한다.
// 발송 성공 시 "○○님 받은 편지함으로 보냈어요"를 표시한다.

import { useState } from 'react';
import { useConnections } from './useConnections';
import { ConnectionPicker } from './ConnectionPicker';
import styles from './SendToConnection.module.css';

interface SendToConnectionProps {
  letterId: string;
}

export function SendToConnection({ letterId }: SendToConnectionProps): React.ReactElement {
  const { connections, sendToConnection, isSending } = useConnections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(): Promise<void> {
    if (selectedId === null) return;
    setError(null);
    try {
      await sendToConnection(letterId, selectedId);
      const recipient = connections.find((c) => c.userId === selectedId);
      setSentName(recipient?.nickname ?? '상대');
    } catch (err) {
      setError(err instanceof Error ? err.message : '보내는 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className={styles.container}>
      <ConnectionPicker
        selectedId={selectedId}
        onSelect={(userId) => {
          setSelectedId(userId);
          // 수신자를 바꾸면 이전 성공 메시지를 지운다.
          setSentName(null);
        }}
      />

      <button
        type="button"
        className={styles.sendBtn}
        onClick={() => void handleSend()}
        disabled={selectedId === null || isSending}
      >
        {isSending ? '보내는 중…' : '보내기'}
      </button>

      {error !== null && <p className={styles.error}>{error}</p>}

      {sentName !== null && (
        <p className={styles.success}>{sentName}님 받은 편지함으로 보냈어요.</p>
      )}
    </div>
  );
}
