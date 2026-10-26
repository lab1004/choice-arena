export class ArenaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function errorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "functions/failed-precondition"
  )
    return error.message;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code).replace("firestore/", "").replace("functions/", "")
      : "";
  const messages: Record<string, string> = {
    "room-not-found": "방을 찾을 수 없어요. 초대 코드를 다시 확인해 주세요.",
    "room-full":
      "방의 정원이 찼어요. 다른 방을 만들거나 참가자가 나간 후 다시 시도해 주세요.",
    "already-in-room": "이미 참가 중인 방이 있어요. 해당 방으로 복원 중입니다.",
    "not-member": "현재 이 방의 참가자가 아니에요. 홈에서 다시 참가해 주세요.",
    "invalid-code":
      "영문 대문자와 숫자로 된 6자리 초대 코드를 입력해 주세요. I, O, 0, 1은 사용하지 않아요.",
    "invalid-nickname":
      "닉네임은 한글, 영문, 숫자, 밑줄로 2~12자 입력해 주세요.",
    "profile-required": "먼저 게임에서 사용할 닉네임을 설정해 주세요.",
    "code-exhausted":
      "초대 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    "permission-denied":
      "접근 권한이 없어요. 로그인 상태와 Firestore 보안 규칙 설정을 확인해 주세요.",
    internal:
      "경기 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요. 서버가 배포되어 있는지도 확인해 주세요.",
    "not-found": "요청한 경기 또는 서버를 찾을 수 없어요.",
    unauthenticated: "로그인 후 다시 시도해 주세요.",
    unavailable:
      "서버에 연결할 수 없어요. 인터넷 연결을 확인한 후 다시 시도해 주세요.",
    offline: "인터넷 연결이 끊겼어요. 다시 연결한 후 시도해 주세요.",
    "deadline-exceeded":
      "서버 응답이 늦어지고 있어요. 연결 상태를 확인해 주세요.",
    aborted: "다른 참가자의 변경과 겹쳤어요. 잠시 후 다시 시도해 주세요.",
    "auth/popup-closed-by-user":
      "로그인 창이 닫혔어요. 다시 로그인할 수 있어요.",
    "auth/cancelled-popup-request": "로그인이 이미 진행 중이에요.",
    "auth/popup-blocked":
      "로그인 팝업이 차단됐어요. 브라우저에서 팝업을 허용해 주세요.",
    "auth/unauthorized-domain":
      "아직 로그인 허용 도메인이 아니에요. Firebase Console에서 도메인을 등록해 주세요.",
    "auth/operation-not-allowed":
      "Google 로그인이 활성화되지 않았어요. Firebase Console 설정이 필요해요.",
    "auth/network-request-failed":
      "로그인 서버에 연결할 수 없어요. 네트워크를 확인해 주세요.",
    "auth/web-storage-unsupported":
      "로그인 저장소를 사용할 수 없어요. 브라우저의 사이트 데이터 설정을 확인해 주세요.",
  };
  return (
    messages[code] || "요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}
