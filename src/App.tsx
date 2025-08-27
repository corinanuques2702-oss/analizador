import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, RotateCcw, AlertTriangle, Volume2, BarChart3, Terminal, Code, Cpu, Activity, Save, Download, Trash2, Clock } from 'lucide-react';

interface AnalysisData {
  transcription: string;
  offensiveWords: string[];
  wordCount: number;
  duration: number;
  averageVolume: number;
  frequencyData: number[];
  audioBlob?: Blob;
  timestamp: number;
  id: string;
}

interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  data: AnalysisData;
}

const OFFENSIVE_WORDS = [
  'idiota', 'estúpido', 'tonto', 'imbécil', 'pendejo', 'cabrón', 'maldito', 'joder',
  'mierda', 'carajo', 'damn', 'shit', 'fuck', 'stupid', 'idiot', 'asshole',
  'bastard', 'bitch', 'hell', 'crap'
];

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackFrequencies, setPlaybackFrequencies] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Load saved sessions from localStorage
    const saved = localStorage.getItem('voiceAnalyzerSessions');
    if (saved) {
      setSavedSessions(JSON.parse(saved));
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });

      // Reset audio chunks
      audioChunksRef.current = [];

      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAnalysisData(prev => prev ? { ...prev, audioBlob } : null);
        }
      };

      // Setup Audio Context for real-time analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Setup Speech Recognition
      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'es-ES';

        recognitionRef.current.onresult = (event) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            }
          }
          if (finalTranscript) {
            setCurrentTranscription(prev => prev + ' ' + finalTranscript);
          }
        };

        recognitionRef.current.start();
      }

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      setCurrentTranscription('');

      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start audio level monitoring
      monitorAudioLevel();

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const monitorAudioLevel = () => {
    if (analyserRef.current) {
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Calculate average volume
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          setAudioLevel(average / 255);

          // Draw frequency visualization
          drawFrequencyBars(dataArray, canvasRef.current);
          
          animationRef.current = requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();
    }
  };

  const drawFrequencyBars = (dataArray: Uint8Array, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    const barWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      
      // Matrix-style green to cyan gradient
      const intensity = dataArray[i] / 255;
      if (intensity > 0.7) {
        ctx.fillStyle = '#00ffff'; // Cyan for high frequencies
      } else if (intensity > 0.4) {
        ctx.fillStyle = '#00ff00'; // Green for medium frequencies
      } else {
        ctx.fillStyle = '#004400'; // Dark green for low frequencies
      }
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsAnalyzing(true);

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      // Analyze the recording
      setTimeout(() => {
        analyzeRecording();
      }, 500);
    }
  };

  const analyzeRecording = () => {
    const words = currentTranscription.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    const detectedOffensiveWords = words.filter(word => 
      OFFENSIVE_WORDS.some(offensive => word.includes(offensive.toLowerCase()))
    );

    // Generate frequency data (simulated for demo)
    const frequencyData = Array.from({ length: 50 }, () => Math.random() * 100);

    const audioBlob = audioChunksRef.current.length > 0 
      ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
      : undefined;

    const analysis: AnalysisData = {
      transcription: currentTranscription,
      offensiveWords: detectedOffensiveWords,
      wordCount: words.length,
      duration: recordingTime,
      averageVolume: audioLevel,
      frequencyData,
      audioBlob,
      timestamp: Date.now(),
      id: Date.now().toString()
    };

    setAnalysisData(analysis);
    setIsAnalyzing(false);
  };

  const playAudio = async () => {
    if (!analysisData?.audioBlob) return;

    if (isPlaying) {
      // Stop playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (playbackContextRef.current) {
        await playbackContextRef.current.close();
      }
      setIsPlaying(false);
      setPlaybackTime(0);
      return;
    }

    try {
      // Create audio element
      const audioUrl = URL.createObjectURL(analysisData.audioBlob);
      
      // Create new audio element each time to avoid issues
      audioRef.current = new Audio(audioUrl);

      // Setup audio context for playback visualization
      if (playbackContextRef.current) {
        await playbackContextRef.current.close();
      }
      
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume context if suspended
      if (playbackContextRef.current.state === 'suspended') {
        await playbackContextRef.current.resume();
      }
      
      const source = playbackContextRef.current.createMediaElementSource(audioRef.current);
      playbackAnalyserRef.current = playbackContextRef.current.createAnalyser();
      playbackAnalyserRef.current.fftSize = 256;
      
      source.connect(playbackAnalyserRef.current);
      playbackAnalyserRef.current.connect(playbackContextRef.current.destination);

      audioRef.current.onended = () => {
        setIsPlaying(false);
        setPlaybackTime(0);
        URL.revokeObjectURL(audioUrl);
      };

      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          setPlaybackTime(audioRef.current.currentTime);
        }
      };

      audioRef.current.onerror = (error) => {
        console.error('Audio playback error:', error);
        setIsPlaying(false);
        alert('Error al reproducir el audio. Intenta grabar de nuevo.');
      };

      await audioRef.current.play();
      setIsPlaying(true);

      // Start playback visualization
      monitorPlaybackFrequencies();

    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      alert('No se pudo reproducir el audio. Verifica que el navegador soporte la reproducción.');
    }
  };

  const monitorPlaybackFrequencies = () => {
    if (playbackAnalyserRef.current) {
      const bufferLength = playbackAnalyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updatePlaybackLevel = () => {
        if (playbackAnalyserRef.current && isPlaying) {
          playbackAnalyserRef.current.getByteFrequencyData(dataArray);
          
          // Draw frequency visualization for playback
          drawFrequencyBars(dataArray, playbackCanvasRef.current);
          
          // Update frequency data for display
          const frequencies = Array.from(dataArray).map(val => (val / 255) * 100);
          setPlaybackFrequencies(frequencies);
          
          requestAnimationFrame(updatePlaybackLevel);
        }
      };
      updatePlaybackLevel();
    }
  };

  const saveSession = () => {
    if (!analysisData) return;

    try {
      const now = new Date();
      const sessionName = `Session_${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;

      // Create a copy of analysis data without the audio blob for storage
      const dataForStorage = {
        ...analysisData,
        audioBlob: undefined // Remove blob to avoid storage issues
      };

      const newSession: SavedSession = {
        id: analysisData.id,
        name: sessionName,
        timestamp: analysisData.timestamp,
        data: dataForStorage
      };

      const updatedSessions = [...savedSessions, newSession];
      setSavedSessions(updatedSessions);
      
      // Save to localStorage with error handling
      try {
        localStorage.setItem('voiceAnalyzerSessions', JSON.stringify(updatedSessions));
        alert(`Sesión guardada como: ${sessionName}`);
      } catch (storageError) {
        console.error('Error saving to localStorage:', storageError);
        alert('Error al guardar la sesión. El almacenamiento local puede estar lleno.');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Error al guardar la sesión.');
    }
  };

  const loadSession = (session: SavedSession) => {
    // Restore the session data
    setAnalysisData({
      ...session.data,
      audioBlob: undefined // Audio blob is not stored, so it won't be available for playback
    });
    setCurrentTranscription(session.data.transcription);
    setIsPlaying(false);
    setPlaybackTime(0);
  };

  const deleteSession = (sessionId: string) => {
    try {
      const updatedSessions = savedSessions.filter(s => s.id !== sessionId);
      setSavedSessions(updatedSessions);
      localStorage.setItem('voiceAnalyzerSessions', JSON.stringify(updatedSessions));
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error al eliminar la sesión.');
    }
  };

  const exportSession = (session: SavedSession) => {
    try {
      const dataStr = JSON.stringify(session, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${session.name}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting session:', error);
      alert('Error al exportar la sesión.');
    }
  };

  const resetAnalysis = () => {
    setAnalysisData(null);
    setCurrentTranscription('');
    setRecordingTime(0);
    setAudioLevel(0);
    setPlaybackTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-green-400 mb-2 flex items-center justify-center gap-3 font-mono">
            <Terminal className="text-cyan-400" />
            voice_analyzer.exe v3.0
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            <span className="text-cyan-400">$</span> Real-time audio processing & session management toolkit
          </p>
          <div className="flex justify-center items-center gap-4 mt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>SYSTEM ONLINE</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <Cpu size={12} className="text-blue-400" />
              <span>CPU: READY</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <Activity size={12} className="text-purple-400" />
              <span>MIC: STANDBY</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <Save size={12} className="text-yellow-400" />
              <span>SESSIONS: {savedSessions.length}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="xl:col-span-3 space-y-6">
            {/* Recording Controls */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 relative overflow-hidden">
              {/* Matrix-style background effect */}
              <div className="absolute inset-0 opacity-5">
                <div className="text-green-400 font-mono text-xs leading-none">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {Array.from({ length: 100 }, () => Math.random() > 0.5 ? '1' : '0').join('')}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col items-center space-y-4">
                <div className="text-center mb-4">
                  <p className="text-green-400 font-mono text-sm mb-1">
                    {'>'} AUDIO_INTERFACE_v3.0.0
                  </p>
                  <div className="flex justify-center gap-4 text-xs font-mono">
                    <span className="text-gray-400">STATUS: <span className={isRecording ? 'text-red-400' : 'text-green-400'}>{isRecording ? 'RECORDING' : 'IDLE'}</span></span>
                    <span className="text-gray-400">MODE: <span className="text-cyan-400">REALTIME</span></span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isAnalyzing}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-2 font-mono text-sm relative ${
                      isRecording
                        ? 'bg-red-900 border-red-500 hover:bg-red-800 animate-pulse text-red-100'
                        : 'bg-green-900 border-green-500 hover:bg-green-800 hover:scale-105 text-green-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20`}
                  >
                    {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
                    {isRecording && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                    )}
                  </button>
                  
                  {analysisData?.audioBlob && (
                    <button
                      onClick={playAudio}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 border-2 font-mono text-sm ${
                        isPlaying
                          ? 'bg-yellow-900 border-yellow-500 hover:bg-yellow-800 text-yellow-100'
                          : 'bg-blue-900 border-blue-500 hover:bg-blue-800 text-blue-100'
                      } shadow-lg shadow-blue-500/20`}
                      title={isPlaying ? 'Pausar reproducción' : 'Reproducir audio grabado'}
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                  )}
                  
                  {analysisData && (
                    <>
                      <button
                        onClick={saveSession}
                        className="px-4 py-2 bg-purple-900 border border-purple-600 hover:bg-purple-800 text-purple-200 rounded-lg transition-colors flex items-center gap-2 font-mono text-sm"
                        title="Guardar sesión actual"
                      >
                        <Save size={16} />
                        SAVE
                      </button>
                      <button
                        onClick={resetAnalysis}
                        className="px-4 py-2 bg-gray-700 border border-gray-600 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors flex items-center gap-2 font-mono text-sm"
                        title="Limpiar análisis actual"
                      >
                        <RotateCcw size={16} />
                        RESET
                      </button>
                    </>
                  )}
                </div>

                {/* Recording Status */}
                <div className="text-center">
                  {isRecording && (
                    <div className="space-y-3">
                      <p className="text-red-400 font-mono text-lg font-bold">
                        [REC] {formatTime(recordingTime)}
                      </p>
                      <div className="w-64 bg-gray-700 rounded-full h-3 border border-gray-600">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-cyan-400 h-3 rounded-full transition-all duration-100 shadow-lg shadow-green-500/50"
                          style={{ width: `${audioLevel * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-gray-400 font-mono text-xs">
                        LEVEL: {(audioLevel * 100).toFixed(1)}% | SAMPLES: {recordingTime * 44100}
                      </p>
                    </div>
                  )}
                  {isPlaying && (
                    <div className="space-y-3">
                      <p className="text-blue-400 font-mono text-lg font-bold">
                        [PLAY] {formatTime(playbackTime)} / {formatTime(analysisData?.duration || 0)}
                      </p>
                      <div className="w-64 bg-gray-700 rounded-full h-3 border border-gray-600">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-purple-400 h-3 rounded-full transition-all duration-100 shadow-lg shadow-blue-500/50"
                          style={{ width: `${((playbackTime / (analysisData?.duration || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  {isAnalyzing && (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-cyan-400 font-mono font-semibold">PROCESSING_AUDIO...</p>
                    </div>
                  )}
                </div>

                {/* Real-time Frequency Visualization */}
                {(isRecording || isPlaying) && (
                  <div className="w-full max-w-lg">
                    <div className="text-center mb-2">
                      <p className="text-green-400 font-mono text-sm">
                        {isRecording ? 'FREQUENCY_ANALYZER.dll' : 'PLAYBACK_VISUALIZER.dll'}
                      </p>
                    </div>
                    <canvas
                      ref={isRecording ? canvasRef : playbackCanvasRef}
                      width={512}
                      height={100}
                      className="w-full h-24 bg-black border border-green-500 rounded-lg shadow-lg shadow-green-500/20"
                    />
                    <p className="text-xs text-gray-400 font-mono text-center mt-2">
                      FFT_SIZE: 256 | SAMPLE_RATE: 44.1kHz | BUFFER: {isRecording ? 'REALTIME' : 'PLAYBACK'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Real-time Transcription */}
            {(isRecording || currentTranscription) && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-green-400 font-mono">
                  <Code className="text-cyan-400" size={20} />
                  speech_to_text.py --realtime
                </h3>
                <div className="bg-black border border-gray-600 rounded-lg p-4 min-h-[100px] font-mono">
                  <div className="text-gray-400 text-xs mb-2">
                    <span className="text-green-400">user@voice-analyzer:~$</span> python speech_recognition.py
                  </div>
                  <p className="text-green-300 leading-relaxed">
                    {currentTranscription || (isRecording ? 'Waiting for audio input...' : 'No transcription data available')}
                    {isRecording && <span className="animate-pulse text-cyan-400">█</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Analysis Results */}
            {analysisData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Transcription Results */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400 font-mono">
                    <BarChart3 className="text-cyan-400" size={20} />
                    analysis_results.json
                  </h3>
                  <div className="space-y-4">
                    <div className="bg-black border border-gray-600 rounded-lg p-4">
                      <h4 className="font-semibold text-green-400 mb-2 font-mono text-sm">
                        {">"} FINAL_TRANSCRIPT:
                      </h4>
                      <p className="text-gray-300 leading-relaxed font-mono text-sm">
                        "{analysisData.transcription || 'null'}"
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
                        <p className="text-blue-400 font-semibold font-mono text-xs">WORD_COUNT</p>
                        <p className="text-2xl font-bold text-blue-300 font-mono">{analysisData.wordCount}</p>
                      </div>
                      <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
                        <p className="text-green-400 font-semibold font-mono text-xs">DURATION</p>
                        <p className="text-2xl font-bold text-green-300 font-mono">{formatTime(analysisData.duration)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Offensive Words Panel */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400 font-mono">
                    <AlertTriangle className="text-red-400" size={20} />
                    content_filter.exe
                  </h3>
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border font-mono ${
                      analysisData.offensiveWords.length > 0 
                        ? 'bg-red-900/20 border-red-700' 
                        : 'bg-green-900/20 border-green-700'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-3 h-3 rounded-full ${
                          analysisData.offensiveWords.length > 0 ? 'bg-red-500' : 'bg-green-500'
                        }`}></div>
                        <span className={`font-semibold text-sm ${
                          analysisData.offensiveWords.length > 0 ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {analysisData.offensiveWords.length > 0 
                            ? `THREAT_LEVEL: HIGH [${analysisData.offensiveWords.length} DETECTED]`
                            : 'STATUS: CLEAN [0x00]'
                          }
                        </span>
                      </div>
                      
                      {analysisData.offensiveWords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {analysisData.offensiveWords.map((word, index) => (
                            <span key={index} className="bg-red-900 border border-red-700 text-red-300 px-2 py-1 rounded text-xs font-mono">
                              [{word}]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-black border border-gray-600 rounded-lg p-4">
                      <h4 className="font-semibold text-green-400 mb-2 font-mono text-sm">SYSTEM_STATS:</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-mono">avg_volume:</span>
                          <span className="font-mono text-cyan-400">{(analysisData.averageVolume * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-mono">wpm:</span>
                          <span className="font-mono text-cyan-400">
                            {analysisData.duration > 0 ? Math.round((analysisData.wordCount / analysisData.duration) * 60) : 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-mono">threat_level:</span>
                          <span className={`font-mono ${
                            analysisData.offensiveWords.length === 0 ? 'text-green-400' : 
                            analysisData.offensiveWords.length <= 2 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {analysisData.offensiveWords.length === 0 ? 'LOW' : 
                             analysisData.offensiveWords.length <= 2 ? 'MEDIUM' : 'HIGH'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Frequency Analysis */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold mb-4 text-green-400 font-mono flex items-center gap-2">
                    <Activity className="text-cyan-400" size={20} />
                    frequency_spectrum.dat {isPlaying && <span className="text-yellow-400 text-sm animate-pulse">[LIVE]</span>}
                  </h3>
                  <div className="h-48 bg-black border border-gray-600 rounded-lg flex items-end justify-center p-4 space-x-1">
                    {(isPlaying ? playbackFrequencies : analysisData.frequencyData).map((value, index) => (
                      <div
                        key={index}
                        className="bg-gradient-to-t from-green-500 via-cyan-400 to-blue-400 rounded-t transition-all duration-300 hover:shadow-lg hover:shadow-green-500/50"
                        style={{
                          height: `${(value / 100) * 160}px`,
                          width: '8px',
                        }}
                      ></div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 font-mono text-center mt-2">
                    FREQ_RANGE: 20Hz - 20kHz | RESOLUTION: 50_BINS | STATUS: {isPlaying ? 'LIVE_PLAYBACK' : 'ANALYZED'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Saved Sessions Sidebar */}
          <div className="xl:col-span-1">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 sticky top-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400 font-mono">
                <Save className="text-cyan-400" size={20} />
                session_manager.db
              </h3>
              
              {savedSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 font-mono text-sm">No saved sessions</p>
                  <p className="text-gray-500 font-mono text-xs mt-2">Record and save to see sessions here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {savedSessions.map((session) => (
                    <div key={session.id} className="bg-black border border-gray-600 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-mono text-sm text-green-400 truncate">
                          {session.name}
                        </h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => exportSession(session)}
                            className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                            title="Export"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="p-1 text-red-400 hover:text-red-300 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-xs font-mono text-gray-400 mb-2">
                        <div className="flex justify-between">
                          <span>Words: {session.data.wordCount}</span>
                          <span>Duration: {formatTime(session.data.duration)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Threats: {session.data.offensiveWords.length}</span>
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(session.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => loadSession(session)}
                        className="w-full px-3 py-1 bg-green-900 border border-green-700 hover:bg-green-800 text-green-300 rounded text-xs font-mono transition-colors"
                        title="Cargar esta sesión"
                      >
                        LOAD_SESSION
                      </button>
                      
                      {session.data.audioBlob === undefined && (
                        <p className="text-xs text-yellow-400 font-mono mt-1 text-center">
                          ⚠ Audio no disponible
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        {!analysisData && !isRecording && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center mt-6">
            <h3 className="text-lg font-semibold text-green-400 mb-4 font-mono flex items-center justify-center gap-2">
              <Terminal className="text-cyan-400" size={20} />
              README.md
            </h3>
            <div className="text-gray-300 space-y-2 font-mono text-sm text-left max-w-2xl mx-auto">
              <p className="text-gray-400"># Voice Analyzer v3.0 Usage</p>
              <p><span className="text-cyan-400">1.</span> Click the microphone button to start recording</p>
              <p><span className="text-cyan-400">2.</span> Speak clearly into your microphone</p>
              <p><span className="text-cyan-400">3.</span> Click again to stop and process audio</p>
              <p><span className="text-cyan-400">4.</span> Use play button to replay recorded audio</p>
              <p><span className="text-cyan-400">5.</span> Save sessions for later analysis</p>
              <p><span className="text-cyan-400">6.</span> Load previous sessions from sidebar</p>
              <p className="text-gray-500 mt-4">## New Features v3.0</p>
              <p className="text-gray-400">- Session persistence with localStorage</p>
              <p className="text-gray-400">- Audio playback with dynamic frequencies</p>
              <p className="text-gray-400">- Export/Import session data</p>
              <p className="text-gray-400">- Enhanced session management</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Declare SpeechRecognition types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    AudioContext: any;
    webkitAudioContext: any;
  }
}

export default App;