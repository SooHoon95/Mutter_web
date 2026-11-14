// sendChoice — 보내기 전 선택의 결과를 발송 UI(링크 발급·연결 상대에게 보내기)에 건네는 컨텍스트.
//
// 서버 계약 "편지권은 실제로 보낼 때만 쓴다": 선택 카드(SendChoiceGate)는 영구 편지를 고른 것만 기억하고,
// 발송 UI가 issue_link / send_to_connection에 p_permanent로 실어 보낸다 — 그때 서버가 편지권 1장을 쓴다.
// 선택 카드를 거치지 않는 경로는 기본값(permanent=false) 그대로라 편지권을 쓰지 않는다.

import { createContext, useContext } from 'react';

export interface SendChoice {
  /** 이번 발급·발송을 영구 편지로 보낼지(편지권 1장). */
  permanent: boolean;
  /** 발급·발송이 성공했다. 인자는 영구로 보냈는지. */
  onSent: (permanent: boolean) => void;
  /** 영구로 보내려 했는데 편지권이 없었다(NO_TICKET) — 링크·발송은 만들어지지 않았다. */
  onNoTicket: () => void;
}

const NOT_CHOSEN: SendChoice = {
  permanent: false,
  onSent: () => {},
  onNoTicket: () => {},
};

export const SendChoiceContext = createContext<SendChoice>(NOT_CHOSEN);

export function useSendChoice(): SendChoice {
  return useContext(SendChoiceContext);
}
