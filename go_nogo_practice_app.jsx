import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Play, RotateCcw, Save, Sparkles, Settings, Trophy, Zap } from "lucide-react";

const STORAGE_KEY = "go-nogo-practice-config-v1";

const DEFAULT_CONFIG = {
  goWords: ["green", "start", "yes", "go", "click"],
  noGoWords: ["red", "stop", "no", "wait", "hold"],
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
  const goChance = 0.7;
  const isGo = Math.random() < goChance;
  const pool = isGo ? config.goWords : config.noGoWords;
  const fallbackPool = isGo ? DEFAULT_CONFIG.goWords : DEFAULT_CONFIG.noGoWords;

  return {
    id: crypto.randomUUID(),
    word: pickRandomItem(pool.length ? pool : fallbackPool),
    type: isGo ? "GO" : "NOGO",
    startedAt: performance.now(),
  };
}

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
    setFeedback({ type: "saved", text: "단어 목록 저장 완료" });
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
      setFeedback({ type: "saved", text: "JSON 설정 저장 완료" });
    } catch {
      setFeedback({ type: "bad", text: "JSON 형식이 올바르지 않음" });
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
    setFeedback({ type: "ready", text: "GO 단어가 나오면 Space 또는 클릭" });

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
          setFeedback({ type: "bad", text: "MISS" });
        } else {
          setScore((prev) => ({ ...prev, correctRejections: prev.correctRejections + 1 }));
          setCombo((prev) => {
            const next = prev + 1;
            setBestCombo((best) => Math.max(best, next));
            return next;
          });
          setFeedback({ type: "good", text: "참기 성공" });
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
          setFeedback({ type: "done", text: "테스트 종료" });
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
      setFeedback({ type: "hit", text: `+${Math.max(10, Math.round(1000 / Math.max(1, reactionTime)))} HIT · ${reactionTime}ms` });
    } else if (currentTrial.type === "GO" && isTooLate) {
      setScore((prev) => ({ ...prev, misses: prev.misses + 1 }));
      setCombo(0);
      setFeedback({ type: "bad", text: `TOO LATE · ${reactionTime}ms` });
    } else {
      setScore((prev) => ({ ...prev, falseAlarms: prev.falseAlarms + 1 }));
      setCombo(0);
      setFeedback({ type: "bad", text: "NOGO 오답" });
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

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(timerRef.current);
    };
  }, []);

  const feedbackClass = {
    hit: "bg-emerald-100 text-emerald-800 border-emerald-300",
    good: "bg-blue-100 text-blue-800 border-blue-300",
    bad: "bg-rose-100 text-rose-800 border-rose-300",
    saved: "bg-violet-100 text-violet-800 border-violet-300",
    ready: "bg-amber-100 text-amber-800 border-amber-300",
    done: "bg-slate-100 text-slate-800 border-slate-300",
  }[feedback?.type || "done"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-violet-300">
              <Zap className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Go / No-Go Practice</span>
            </div>
            <h1 className="mt-2 text-3xl md:text-5xl font-black tracking-tight">반응 억제 훈련 게임</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              GO 단어가 나오면 Space 또는 버튼을 누르고, NOGO 단어는 참으세요. 단어와 테스트 설정은 JSON / 쉼표 입력 모두 지원합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={isRunning ? stopTest : startTest} className="rounded-2xl px-5 py-6 text-base font-bold">
              {isRunning ? "중지" : "시작"}
              {!isRunning && <Play className="ml-2 h-4 w-4" />}
            </Button>
            <Button onClick={resetScore} variant="secondary" className="rounded-2xl px-4 py-6">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <Card className="overflow-hidden rounded-3xl border-slate-800 bg-slate-900/70 shadow-2xl">
              <CardContent className="p-0">
                <div className="relative flex min-h-[430px] flex-col items-center justify-center overflow-hidden p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.18),transparent_45%)]" />

                  <div className="absolute left-6 top-6 flex gap-2">
                    <Badge className="rounded-full bg-slate-800 px-4 py-2 text-slate-200">남은 시간 {timeLeft}s</Badge>
                    <Badge className="rounded-full bg-slate-800 px-4 py-2 text-slate-200">콤보 {combo}</Badge>
                  </div>

                  <AnimatePresence mode="wait">
                    {currentTrial ? (
                      <motion.div
                        key={currentTrial.id}
                        initial={{ opacity: 0, scale: 0.7, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.25, y: -30 }}
                        transition={{ type: "spring", stiffness: 280, damping: 18 }}
                        className="relative z-10 text-center"
                      >
                        <div className="mb-5 text-sm font-bold tracking-[0.35em] text-slate-500">{currentTrial.type}</div>
                        <div className="rounded-[2rem] border border-slate-700 bg-slate-950/70 px-12 py-10 shadow-2xl">
                          <div className="text-6xl md:text-8xl font-black tracking-tight">{currentTrial.word}</div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 text-center text-slate-400">
                        <Trophy className="mx-auto mb-4 h-14 w-14 text-violet-300" />
                        <div className="text-2xl font-bold">시작 버튼을 누르세요</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {feedback && (
                      <motion.div
                        key={`${feedback.type}-${feedback.text}-${combo}`}
                        initial={{ opacity: 0, y: 30, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className={`absolute bottom-28 z-20 rounded-2xl border px-5 py-3 text-lg font-black shadow-xl ${feedbackClass}`}
                      >
                        <div className="flex items-center gap-2">
                          {(feedback.type === "hit" || feedback.type === "good") && <Sparkles className="h-5 w-5" />}
                          {feedback.text}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {feedback?.type === "hit" && (
                      <motion.div
                        key={`burst-${combo}-${score.hits}`}
                        initial={{ opacity: 0.9, scale: 0 }}
                        animate={{ opacity: 0, scale: 3.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.55 }}
                        className="absolute z-0 h-48 w-48 rounded-full border-8 border-violet-400"
                      />
                    )}
                  </AnimatePresence>

                  <Button
                    onClick={handleGoResponse}
                    disabled={!isRunning}
                    className="absolute bottom-6 z-10 rounded-3xl px-10 py-8 text-xl font-black shadow-2xl active:scale-95"
                  >
                    GO!
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-5">
              <StatCard label="정확도" value={`${accuracy}%`} />
              <StatCard label="평균 반응" value={averageReactionTime ? `${averageReactionTime}ms` : "-"} />
              <StatCard label="Hit" value={score.hits} />
              <StatCard label="False Alarm" value={score.falseAlarms} />
              <StatCard label="Best Combo" value={bestCombo} />
            </div>
          </section>

          <aside className="space-y-6">
            <Card className="rounded-3xl border-slate-800 bg-slate-900/70 shadow-xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-slate-200">
                  <Settings className="h-5 w-5 text-violet-300" />
                  <h2 className="text-xl font-black">단어 설정</h2>
                </div>

                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-emerald-300">GO 단어 쉼표 입력</span>
                  <Textarea
                    value={goInput}
                    onChange={(event) => setGoInput(event.target.value)}
                    placeholder="green, start, yes"
                    className="min-h-24 rounded-2xl border-slate-700 bg-slate-950 text-slate-100"
                  />
                </label>

                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-rose-300">NOGO 단어 쉼표 입력</span>
                  <Textarea
                    value={noGoInput}
                    onChange={(event) => setNoGoInput(event.target.value)}
                    placeholder="red, stop, no"
                    className="min-h-24 rounded-2xl border-slate-700 bg-slate-950 text-slate-100"
                  />
                </label>

                <Button onClick={syncFromCommaInputs} className="w-full rounded-2xl py-6 font-black">
                  <Save className="mr-2 h-4 w-4" />
                  쉼표 입력을 JSON으로 저장
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-800 bg-slate-900/70 shadow-xl">
              <CardContent className="space-y-4 p-5">
                <h2 className="text-xl font-black">테스트 설정</h2>

                <div className="grid grid-cols-3 gap-3">
                  <NumberInput label="시간초" value={config.testTimeSec} onChange={(value) => updateNumberSetting("testTimeSec", value)} />
                  <NumberInput label="반응제한ms" value={config.responseLimitMs} onChange={(value) => updateNumberSetting("responseLimitMs", value)} />
                  <NumberInput label="간격ms" value={config.stimulusIntervalMs} onChange={(value) => updateNumberSetting("stimulusIntervalMs", value)} />
                </div>

                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-slate-300">JSON 직접 편집</span>
                  <Textarea
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    className="min-h-56 rounded-2xl border-slate-700 bg-slate-950 font-mono text-xs text-slate-100"
                  />
                </label>

                <Button onClick={syncFromJson} variant="secondary" className="w-full rounded-2xl py-6 font-black">
                  JSON 적용 및 저장
                </Button>

                <p className="text-xs leading-relaxed text-slate-500">
                  저장 위치: 브라우저 localStorage. 같은 브라우저와 같은 localhost 주소에서 다시 열면 이전 단어 목록이 유지됩니다.
                </p>
              </CardContent>
            </Card>
          </aside>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card className="rounded-3xl border-slate-800 bg-slate-900/70 shadow-xl">
      <CardContent className="p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-2 text-2xl font-black text-slate-100">{value}</div>
      </CardContent>
    </Card>
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <label className="space-y-2 block">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border-slate-700 bg-slate-950 text-slate-100"
      />
    </label>
  );
}
