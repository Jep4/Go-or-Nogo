import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Swords,
  TimerReset,
  Trophy,
  WandSparkles,
} from "lucide-react";

const STORAGE_KEY = "go-nogo-practice-config-v1";

const DEFAULT_CONFIG = {
  goWords: ["attack", "charge", "advance", "slash", "focus"],
  noGoWords: ["curse", "halt", "trap", "guard", "wait"],
  testTimeSec: 60,
  responseLimitMs: 900,
  stimulusIntervalMs: 1200,
};

function normalizeWords(input) {
  if (Array.isArray(input)) {
    return input.map((word) => String(word).trim()).filter(Boolean);
  }

  return String(input || "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

function uniqueWords(words) {
  return Array.from(new Set(words.map((word) => word.trim()).filter(Boolean)));
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_CONFIG;

    const parsed = JSON.parse(saved);
    return {
      goWords: uniqueWords(normalizeWords(parsed.goWords)),
      noGoWords: uniqueWords(normalizeWords(parsed.noGoWords)),
      testTimeSec: Number(parsed.testTimeSec) || DEFAULT_CONFIG.testTimeSec,
      responseLimitMs: Number(parsed.responseLimitMs) || DEFAULT_CONFIG.responseLimitMs,
      stimulusIntervalMs: Number(parsed.stimulusIntervalMs) || DEFAULT_CONFIG.stimulusIntervalMs,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  const cleaned = {
    goWords: uniqueWords(normalizeWords(config.goWords)),
    noGoWords: uniqueWords(normalizeWords(config.noGoWords)),
    testTimeSec: Math.max(5, Number(config.testTimeSec) || DEFAULT_CONFIG.testTimeSec),
    responseLimitMs: Math.max(100, Number(config.responseLimitMs) || DEFAULT_CONFIG.responseLimitMs),
    stimulusIntervalMs: Math.max(300, Number(config.stimulusIntervalMs) || DEFAULT_CONFIG.stimulusIntervalMs),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned, null, 2));
  return cleaned;
}

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createTrial(config) {
  const isGo = Math.random() < 0.7;
  const pool = isGo ? config.goWords : config.noGoWords;
  const fallbackPool = isGo ? DEFAULT_CONFIG.goWords : DEFAULT_CONFIG.noGoWords;

  return {
    id: crypto.randomUUID(),
    word: pickRandomItem(pool.length ? pool : fallbackPool),
    type: isGo ? "GO" : "NOGO",
    startedAt: performance.now(),
  };
}

const FEEDBACK_STYLES = {
  hit: "border-amber-300/70 bg-amber-100 text-amber-950",
  good: "border-emerald-300/70 bg-emerald-100 text-emerald-950",
  bad: "border-rose-300/70 bg-rose-100 text-rose-950",
  saved: "border-sky-300/70 bg-sky-100 text-sky-950",
  ready: "border-violet-300/70 bg-violet-100 text-violet-950",
  done: "border-slate-300/70 bg-slate-100 text-slate-950",
};

export default function GoNoGoPracticeApp() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [goInput, setGoInput] = useState(DEFAULT_CONFIG.goWords.join(", "));
  const [noGoInput, setNoGoInput] = useState(DEFAULT_CONFIG.noGoWords.join(", "));
  const [jsonText, setJsonText] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [isRunning, setIsRunning] = useState(false);
  const [currentTrial, setCurrentTrial] = useState(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_CONFIG.testTimeSec);
  const [feedback, setFeedback] = useState(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [score, setScore] = useState({
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
    reactionTimes: [],
  });

  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const trialRef = useRef(null);
  const handledTrialIdsRef = useRef(new Set());

  useEffect(() => {
    const saved = loadConfig();
    setConfig(saved);
    setGoInput(saved.goWords.join(", "));
    setNoGoInput(saved.noGoWords.join(", "));
    setJsonText(JSON.stringify(saved, null, 2));
    setTimeLeft(saved.testTimeSec);
  }, []);

  useEffect(() => {
    trialRef.current = currentTrial;
  }, [currentTrial]);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(timerRef.current);
    };
  }, []);

  const averageReactionTime = useMemo(() => {
    if (!score.reactionTimes.length) return 0;
    const total = score.reactionTimes.reduce((sum, time) => sum + time, 0);
    return Math.round(total / score.reactionTimes.length);
  }, [score.reactionTimes]);

  const totalTrials = score.hits + score.misses + score.falseAlarms + score.correctRejections;
  const accuracy = totalTrials
    ? Math.round(((score.hits + score.correctRejections) / totalTrials) * 100)
    : 0;

  function syncFromCommaInputs() {
    const nextConfig = saveConfig({
      ...config,
      goWords: normalizeWords(goInput),
      noGoWords: normalizeWords(noGoInput),
    });

    setConfig(nextConfig);
    setJsonText(JSON.stringify(nextConfig, null, 2));
    setTimeLeft(nextConfig.testTimeSec);
    setFeedback({ type: "saved", text: "주문 목록을 두루마리에 기록했습니다." });
  }

  function syncFromJson() {
    try {
      const parsed = JSON.parse(jsonText);
      const nextConfig = saveConfig(parsed);
      setConfig(nextConfig);
      setGoInput(nextConfig.goWords.join(", "));
      setNoGoInput(nextConfig.noGoWords.join(", "));
      setJsonText(JSON.stringify(nextConfig, null, 2));
      setTimeLeft(nextConfig.testTimeSec);
      setFeedback({ type: "saved", text: "전술서 설정을 적용했습니다." });
    } catch {
      setFeedback({ type: "bad", text: "JSON 주문서 형식이 올바르지 않습니다." });
    }
  }

  function updateNumberSetting(key, value) {
    const nextConfig = saveConfig({ ...config, [key]: Number(value) });
    setConfig(nextConfig);
    setJsonText(JSON.stringify(nextConfig, null, 2));
    if (key === "testTimeSec") setTimeLeft(nextConfig.testTimeSec);
  }

  function resetScore() {
    setScore({
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
      reactionTimes: [],
    });
    setCombo(0);
    setBestCombo(0);
    setFeedback(null);
    handledTrialIdsRef.current = new Set();
  }

  function stopTest() {
    setIsRunning(false);
    setCurrentTrial(null);
    clearInterval(intervalRef.current);
    clearInterval(timerRef.current);
    setFeedback({ type: "done", text: "훈련을 멈추고 전열을 정비했습니다." });
  }

  function startTest() {
    const nextConfig = saveConfig({
      ...config,
      goWords: normalizeWords(goInput),
      noGoWords: normalizeWords(noGoInput),
    });

    setConfig(nextConfig);
    setJsonText(JSON.stringify(nextConfig, null, 2));
    setTimeLeft(nextConfig.testTimeSec);
    resetScore();
    setIsRunning(true);
    setFeedback({ type: "ready", text: "GO 단어가 뜨면 스페이스 또는 공격 버튼을 누르세요." });

    const firstTrial = createTrial(nextConfig);
    setCurrentTrial(firstTrial);

    clearInterval(intervalRef.current);
    clearInterval(timerRef.current);

    intervalRef.current = setInterval(() => {
      const activeTrial = trialRef.current;

      if (activeTrial && !handledTrialIdsRef.current.has(activeTrial.id)) {
        handledTrialIdsRef.current.add(activeTrial.id);

        if (activeTrial.type === "GO") {
          setScore((prev) => ({ ...prev, misses: prev.misses + 1 }));
          setCombo(0);
          setFeedback({ type: "bad", text: "공격 기회를 놓쳤습니다." });
        } else {
          setScore((prev) => ({ ...prev, correctRejections: prev.correctRejections + 1 }));
          setCombo((prev) => {
            const next = prev + 1;
            setBestCombo((best) => Math.max(best, next));
            return next;
          });
          setFeedback({ type: "good", text: "함정을 침착하게 피했습니다." });
        }
      }

      setCurrentTrial(createTrial(nextConfig));
    }, nextConfig.stimulusIntervalMs);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          clearInterval(timerRef.current);
          setIsRunning(false);
          setCurrentTrial(null);
          setFeedback({ type: "done", text: "전투 훈련이 종료되었습니다." });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function handleGoResponse() {
    if (!isRunning || !currentTrial) return;
    if (handledTrialIdsRef.current.has(currentTrial.id)) return;

    handledTrialIdsRef.current.add(currentTrial.id);
    const reactionTime = Math.round(performance.now() - currentTrial.startedAt);
    const isTooLate = reactionTime > config.responseLimitMs;

    if (currentTrial.type === "GO" && !isTooLate) {
      setScore((prev) => ({
        ...prev,
        hits: prev.hits + 1,
        reactionTimes: [...prev.reactionTimes, reactionTime],
      }));
      setCombo((prev) => {
        const next = prev + 1;
        setBestCombo((best) => Math.max(best, next));
        return next;
      });
      setFeedback({
        type: "hit",
        text: `회심의 일격 ${reactionTime}ms`,
      });
    } else if (currentTrial.type === "GO" && isTooLate) {
      setScore((prev) => ({ ...prev, misses: prev.misses + 1 }));
      setCombo(0);
      setFeedback({ type: "bad", text: `반응이 늦었습니다 ${reactionTime}ms` });
    } else {
      setScore((prev) => ({ ...prev, falseAlarms: prev.falseAlarms + 1 }));
      setCombo(0);
      setFeedback({ type: "bad", text: "함정 단어에 속았습니다." });
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.code === "Space") {
        event.preventDefault();
        handleGoResponse();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const feedbackClass = FEEDBACK_STYLES[feedback?.type || "done"];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#25305f_0%,#151631_35%,#090b18_100%)] px-3 py-4 text-[#fff7de] sm:px-4 sm:py-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-4 rounded-[28px] border border-[#f8de9c]/30 bg-[#100f24]/80 p-3 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur sm:gap-6 sm:p-5 lg:p-6">
        <header className="relative overflow-hidden rounded-[24px] border border-[#f8de9c]/40 bg-[linear-gradient(135deg,rgba(42,58,118,0.95),rgba(18,20,52,0.95))] px-4 py-5 shadow-[inset_0_0_0_2px_rgba(255,247,222,0.08)] sm:px-6 sm:py-6">
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,240,185,0.18),transparent_70%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f8de9c]/40 bg-[#1d2146]/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.35em] text-[#ffe497]">
                <WandSparkles className="h-4 w-4" />
                Dragon Quest Style Training
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-[0.06em] text-[#fff6d9] sm:text-4xl lg:text-5xl">
                용사의 반응 수련장
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#e7dbb3] sm:text-base">
                전통 JRPG 전투 화면 감성으로 다시 꾸민 Go / No-Go 훈련입니다. 웹에서는 넓은 전투 보드로,
                앱에서는 손가락으로 바로 누르기 쉬운 세로형 인터페이스로 동작합니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <StatusBadge icon={TimerReset} label="남은 시간" value={`${timeLeft}s`} />
              <StatusBadge icon={Sparkles} label="콤보" value={`${combo}`} />
              <ActionButton
                onClick={isRunning ? stopTest : startTest}
                className="col-span-2 sm:col-span-1"
              >
                {isRunning ? "훈련 중지" : "훈련 시작"}
                {!isRunning && <Play className="h-4 w-4" />}
              </ActionButton>
              <ActionButton
                onClick={resetScore}
                variant="secondary"
                className="col-span-2 sm:col-span-1"
              >
                전적 초기화
                <RotateCcw className="h-4 w-4" />
              </ActionButton>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <section className="flex min-h-0 flex-col gap-4">
            <Panel className="relative flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(30,38,82,0.96),rgba(11,12,28,0.96))] p-0">
              <div className="absolute inset-x-0 top-0 h-2 bg-[linear-gradient(90deg,#f7d98e,#fff0c4,#f7d98e)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(112,173,255,0.18),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(255,215,130,0.12),transparent_40%)]" />

              <div className="relative flex min-h-[460px] flex-col justify-between px-4 py-4 sm:px-6 sm:py-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <BattleStat label="정확도" value={`${accuracy}%`} note="명중률" />
                  <BattleStat
                    label="평균 반응"
                    value={averageReactionTime ? `${averageReactionTime}ms` : "-"}
                    note="속도"
                  />
                  <BattleStat label="최고 콤보" value={`${bestCombo}`} note="연속" />
                </div>

                <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f7d98e]/35 bg-[#141935]/85 px-3 py-1 text-xs font-bold tracking-[0.25em] text-[#ffe497]">
                    <Shield className="h-4 w-4" />
                    {currentTrial ? `조우 타입 ${currentTrial.type}` : "전투 대기"}
                  </div>

                  <AnimatePresence mode="wait">
                    {currentTrial ? (
                      <motion.div
                        key={currentTrial.id}
                        initial={{ opacity: 0, y: 28, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -18, scale: 1.08 }}
                        transition={{ type: "spring", stiffness: 220, damping: 18 }}
                        className="w-full max-w-2xl"
                      >
                        <div className="rounded-[26px] border-4 border-[#f7d98e]/50 bg-[linear-gradient(180deg,rgba(255,248,221,0.12),rgba(255,248,221,0.04))] px-5 py-10 shadow-[0_22px_60px_rgba(0,0,0,0.35)] sm:px-8 sm:py-14">
                          <div className="mb-4 text-xs font-bold uppercase tracking-[0.5em] text-[#f7d98e]">
                            {currentTrial.type === "GO" ? "Attack Command" : "Trap Command"}
                          </div>
                          <div className="break-words text-4xl font-black tracking-[0.08em] text-[#fff8e5] sm:text-6xl lg:text-7xl">
                            {currentTrial.word}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full max-w-xl rounded-[24px] border border-[#f7d98e]/35 bg-[#12162f]/80 px-6 py-10"
                      >
                        <Trophy className="mx-auto mb-4 h-14 w-14 text-[#ffe497]" />
                        <div className="text-2xl font-black tracking-[0.08em] text-[#fff8e5]">
                          여정을 시작할 준비가 되었습니다
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#d7c99c]">
                          GO 단어가 나타나면 바로 공격하고, NOGO 단어가 나타나면 침착하게 멈추세요.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-3">
                  <AnimatePresence>
                    {feedback && (
                      <motion.div
                        key={`${feedback.type}-${feedback.text}-${combo}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`rounded-[18px] border px-4 py-3 text-center text-sm font-bold shadow-[0_12px_40px_rgba(0,0,0,0.28)] sm:text-base ${feedbackClass}`}
                      >
                        {feedback.text}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <ActionButton
                    onClick={handleGoResponse}
                    disabled={!isRunning}
                    className="w-full justify-center rounded-[22px] px-6 py-4 text-base sm:py-5 sm:text-lg"
                  >
                    <Swords className="h-5 w-5" />
                    공격하기
                    <span className="rounded-full bg-black/20 px-2 py-1 text-[11px] tracking-[0.25em] text-white/85">
                      SPACE
                    </span>
                  </ActionButton>
                </div>
              </div>
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <RecordCard label="HIT" value={score.hits} tone="gold" />
              <RecordCard label="MISS" value={score.misses} tone="rose" />
              <RecordCard label="FALSE" value={score.falseAlarms} tone="violet" />
              <RecordCard label="GUARD" value={score.correctRejections} tone="emerald" />
              <RecordCard label="COMBO" value={bestCombo} tone="sky" />
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-4">
            <Panel className="bg-[linear-gradient(180deg,rgba(27,29,60,0.96),rgba(14,15,34,0.96))] p-4 sm:p-5">
              <SectionTitle icon={Save} title="명령어 도감" />

              <label className="mt-4 block space-y-2">
                <span className="text-sm font-bold text-[#ffe497]">GO 단어</span>
                <Textarea
                  value={goInput}
                  onChange={(event) => setGoInput(event.target.value)}
                  placeholder="attack, charge, advance"
                  className="min-h-28"
                />
              </label>

              <label className="mt-4 block space-y-2">
                <span className="text-sm font-bold text-[#ffd1c4]">NOGO 단어</span>
                <Textarea
                  value={noGoInput}
                  onChange={(event) => setNoGoInput(event.target.value)}
                  placeholder="trap, halt, wait"
                  className="min-h-28"
                />
              </label>

              <ActionButton onClick={syncFromCommaInputs} className="mt-4 w-full justify-center">
                <Save className="h-4 w-4" />
                단어 목록 저장
              </ActionButton>
            </Panel>

            <Panel className="bg-[linear-gradient(180deg,rgba(27,29,60,0.96),rgba(14,15,34,0.96))] p-4 sm:p-5">
              <SectionTitle icon={TimerReset} title="전술 세팅" />

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberInput
                  label="훈련 시간(초)"
                  value={config.testTimeSec}
                  onChange={(value) => updateNumberSetting("testTimeSec", value)}
                />
                <NumberInput
                  label="반응 제한(ms)"
                  value={config.responseLimitMs}
                  onChange={(value) => updateNumberSetting("responseLimitMs", value)}
                />
                <NumberInput
                  label="등장 간격(ms)"
                  value={config.stimulusIntervalMs}
                  onChange={(value) => updateNumberSetting("stimulusIntervalMs", value)}
                />
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-sm font-bold text-[#d8cdf8]">JSON 전술서</span>
                <Textarea
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  className="min-h-64 font-mono text-xs"
                />
              </label>

              <ActionButton onClick={syncFromJson} variant="secondary" className="mt-4 w-full justify-center">
                JSON 적용
              </ActionButton>

              <p className="mt-4 text-xs leading-6 text-[#d5c897]">
                설정은 현재 브라우저의 localStorage에 저장됩니다. 같은 기기와 주소에서 다시 열면 이어서
                사용할 수 있습니다.
              </p>
            </Panel>
          </aside>
        </main>
      </div>
    </div>
  );
}

function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-[26px] border border-[#f7d98e]/30 shadow-[inset_0_0_0_2px_rgba(255,247,222,0.06),0_18px_48px_rgba(0,0,0,0.32)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 text-[#fff0c4]">
      <div className="rounded-full border border-[#f7d98e]/40 bg-[#181c3c] p-2">
        <Icon className="h-4 w-4" />
      </div>
      <h2 className="text-lg font-black tracking-[0.08em] sm:text-xl">{title}</h2>
    </div>
  );
}

function StatusBadge({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[18px] border border-[#f7d98e]/35 bg-[#171b3a]/80 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,247,222,0.06)]">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[#d8cdf8]">
        <Icon className="h-4 w-4 text-[#ffe497]" />
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-[#fff8e5]">{value}</div>
    </div>
  );
}

function BattleStat({ label, value, note }) {
  return (
    <div className="rounded-[18px] border border-[#f7d98e]/25 bg-[#12152f]/75 px-4 py-3 text-left shadow-[inset_0_0_0_1px_rgba(255,247,222,0.05)]">
      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#cdbf8a]">{label}</div>
      <div className="mt-1 text-2xl font-black text-[#fff7de]">{value}</div>
      <div className="text-xs text-[#b9b1d4]">{note}</div>
    </div>
  );
}

function RecordCard({ label, value, tone = "gold" }) {
  const tones = {
    gold: "from-[#ffe8a3]/20 to-[#d49f1f]/15 text-[#fff2c2]",
    rose: "from-[#ffb6bf]/20 to-[#9e3b58]/15 text-[#ffe0e6]",
    violet: "from-[#d5b6ff]/20 to-[#6240a1]/15 text-[#efe3ff]",
    emerald: "from-[#bdf6db]/20 to-[#267d58]/15 text-[#dffcec]",
    sky: "from-[#b9dbff]/20 to-[#305e9f]/15 text-[#e1f0ff]",
  };

  return (
    <div className={`rounded-[20px] border border-[#f7d98e]/25 bg-[linear-gradient(180deg,rgba(20,23,49,0.95),rgba(11,12,28,0.95))] px-4 py-4`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#cdbf8a]">{label}</div>
      <div className={`mt-2 rounded-[16px] bg-gradient-to-br px-3 py-4 text-center text-3xl font-black shadow-inner ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({ children, className = "", variant = "primary", disabled = false, ...props }) {
  const base =
    "inline-flex items-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-black tracking-[0.08em] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
  const variants = {
    primary:
      "border-[#ffe497]/60 bg-[linear-gradient(180deg,#d07a22,#8d3f11)] text-[#fff8eb] shadow-[0_8px_0_0_rgba(74,31,10,0.9)] hover:brightness-110",
    secondary:
      "border-[#cbbbf9]/45 bg-[linear-gradient(180deg,#51428f,#2e235d)] text-[#f6f2ff] shadow-[0_8px_0_0_rgba(21,15,46,0.95)] hover:brightness-110",
  };

  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-[16px] border border-[#f7d98e]/25 bg-[#0f1330] px-3 py-3 text-sm text-[#fff8e5] outline-none placeholder:text-[#8f8aa8] focus:border-[#ffe497] focus:ring-2 focus:ring-[#ffe497]/25 ${className}`}
      {...props}
    />
  );
}

function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full rounded-[18px] border border-[#f7d98e]/25 bg-[#0f1330] px-3 py-3 text-sm leading-6 text-[#fff8e5] outline-none placeholder:text-[#8f8aa8] focus:border-[#ffe497] focus:ring-2 focus:ring-[#ffe497]/25 ${className}`}
      {...props}
    />
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-bold tracking-[0.08em] text-[#d8cdf8]">{label}</span>
      <Input type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
