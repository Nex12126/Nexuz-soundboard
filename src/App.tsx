import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent } from 'react'
import {
  AudioLines,
  AudioWaveform,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Headphones,
  Keyboard,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import './App.css'

type SoundItem = {
  id: string
  name: string
  src: string
  extension: string
}

type SoundQuality = 'original' | 'warm' | 'telephone' | 'lofi' | 'roughcomms'
type MicrophoneEffect = 'clean' | 'radio' | 'deep' | 'bright' | 'robot' | 'cooked'

const qualityCutoffs: Record<SoundQuality, number> = {
  original: 22000,
  warm: 5000,
  telephone: 2800,
  lofi: 1300,
  roughcomms: 1650,
}

type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>
}

declare global {
  interface Window {
    soundboard?: {
      pickAudioFiles: () => Promise<string[]>
      openSoundArchive?: () => Promise<void>
      listAudioSources?: () => Promise<Array<{ id: string; name: string }>>
      startProcessAudio?: (processId: number) => Promise<boolean>
      stopProcessAudio?: () => Promise<void>
      onProcessAudioData?: (callback: (chunk: Uint8Array) => void) => () => void
    }
  }
}

const storageKey = 'nexuz-soundboard-sounds'
const soundArchiveUrl = 'https://soundbuttonsfun.com/sound-archive/'

function App() {
  const [sounds, setSounds] = useState<SoundItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as SoundItem[]
    } catch {
      return []
    }
  })
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedInput, setSelectedInput] = useState('default')
  const [selectedOutput, setSelectedOutput] = useState(
    () => localStorage.getItem('nexuz-soundboard-output') ?? 'default',
  )
  const [volume, setVolume] = useState(80)
  const [micVolume, setMicVolume] = useState(80)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)
  const [microphoneEffect, setMicrophoneEffect] = useState<MicrophoneEffect>('clean')
  const [audioSources, setAudioSources] = useState<Array<{ id: string; name: string }>>([])
  const [selectedAudioSource, setSelectedAudioSource] = useState('')
  const [processAudioEnabled, setProcessAudioEnabled] = useState(false)
  const [processAudioVolume, setProcessAudioVolume] = useState(80)
  const [overdriveEnabled, setOverdriveEnabled] = useState(false)
  const [soundQuality, setSoundQuality] = useState<SoundQuality>('original')
  const [searchQuery, setSearchQuery] = useState('')
  const [hotkeysEnabled, setHotkeysEnabled] = useState(() => localStorage.getItem('nexuz-hotkeys-enabled') !== 'false')
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexuz-hotkeys') ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  })
  const [recordingSoundId, setRecordingSoundId] = useState<string | null>(null)
  const [activeSounds, setActiveSounds] = useState<Set<string>>(() => new Set())
  const [logoAvailable, setLogoAvailable] = useState(true)
  const [notice, setNotice] = useState('')
  const audioRefs = useRef(new Map<string, HTMLAudioElement>())
  const soundSources = useRef(new Map<string, MediaElementAudioSourceNode>())
  const soundGains = useRef(new Map<string, GainNode>())
  const soundFilters = useRef(new Map<string, BiquadFilterNode>())
  const soundDrives = useRef(new Map<string, WaveShaperNode>())
  const audioContext = useRef<AudioContext | null>(null)
  const masterGain = useRef<GainNode | null>(null)
  const overdrive = useRef<WaveShaperNode | null>(null)
  const microphoneFilter = useRef<BiquadFilterNode | null>(null)
  const microphoneTone = useRef<BiquadFilterNode | null>(null)
  const microphoneDrive = useRef<WaveShaperNode | null>(null)
  const microphoneCookedDrive = useRef<WaveShaperNode | null>(null)
  const microphoneModulator = useRef<GainNode | null>(null)
  const microphoneStream = useRef<MediaStream | null>(null)
  const microphoneSource = useRef<MediaStreamAudioSourceNode | null>(null)
  const microphoneGain = useRef<GainNode | null>(null)
  const processAudioNode = useRef<AudioWorkletNode | null>(null)
  const processAudioGain = useRef<GainNode | null>(null)
  const removeProcessAudioListener = useRef<(() => void) | null>(null)
  const processAudioWorkletLoaded = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const routeMicrophone = () => {
    const gain = microphoneGain.current
    const filter = microphoneFilter.current
    const tone = microphoneTone.current
    const drive = microphoneDrive.current
    const cookedDrive = microphoneCookedDrive.current
    const modulator = microphoneModulator.current
    const target = overdriveEnabled ? overdrive.current : masterGain.current
    if (!gain || !filter || !tone || !drive || !cookedDrive || !modulator || !target) return

    gain.disconnect()
    filter.disconnect()
    tone.disconnect()
    drive.disconnect()
    cookedDrive.disconnect()
    modulator.disconnect()
    filter.type = 'lowpass'
    filter.frequency.value = 22000
    filter.Q.value = 0.707
    tone.type = 'peaking'
    tone.frequency.value = 1000
    tone.gain.value = 0
    tone.Q.value = 0.707
    modulator.gain.value = 0.55

    let previous: AudioNode = gain
    if (microphoneEffect === 'radio') {
      filter.type = 'bandpass'
      filter.frequency.value = 1650
      filter.Q.value = 0.75
      previous.connect(filter)
      previous = filter
      previous.connect(drive)
      previous = drive
    } else if (microphoneEffect === 'deep') {
      filter.frequency.value = 5200
      tone.type = 'lowshelf'
      tone.frequency.value = 180
      tone.gain.value = 8
      previous.connect(filter)
      previous = filter
      previous.connect(tone)
      previous = tone
    } else if (microphoneEffect === 'bright') {
      filter.type = 'highpass'
      filter.frequency.value = 120
      tone.type = 'highshelf'
      tone.frequency.value = 2800
      tone.gain.value = 6
      previous.connect(filter)
      previous = filter
      previous.connect(tone)
      previous = tone
    } else if (microphoneEffect === 'robot') {
      filter.type = 'bandpass'
      filter.frequency.value = 1150
      filter.Q.value = 1.2
      previous.connect(filter)
      previous = filter
      previous.connect(drive)
      previous = drive
      previous.connect(modulator)
      previous = modulator
    } else if (microphoneEffect === 'cooked') {
      filter.type = 'highpass'
      filter.frequency.value = 280
      filter.Q.value = 0.8
      tone.type = 'lowpass'
      tone.frequency.value = 3200
      tone.Q.value = 0.8
      previous.connect(filter)
      previous = filter
      previous.connect(tone)
      previous = tone
      previous.connect(cookedDrive)
      previous = cookedDrive
    }
    previous.connect(target)
  }

  const routeMicrophoneFromEffect = useEffectEvent(() => routeMicrophone())

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(sounds))
  }, [sounds])

  useEffect(() => {
    localStorage.setItem('nexuz-soundboard-output', selectedOutput)
    const context = audioContext.current as SinkAudioContext | null
    if (context?.setSinkId) {
      void context.setSinkId(selectedOutput).catch(() => {
        setNotice('Could not switch the audio output device.')
      })
    }
  }, [selectedOutput])

  useEffect(() => {
    localStorage.setItem('nexuz-hotkeys', JSON.stringify(hotkeys))
    localStorage.setItem('nexuz-hotkeys-enabled', String(hotkeysEnabled))
  }, [hotkeys, hotkeysEnabled])

  useEffect(() => {
    if (masterGain.current) masterGain.current.gain.value = volume / 100
  }, [volume])

  useEffect(() => {
    if (microphoneGain.current) microphoneGain.current.gain.value = micVolume / 100
  }, [micVolume])

  useEffect(() => {
    if (processAudioGain.current) processAudioGain.current.gain.value = processAudioVolume / 100
  }, [processAudioVolume])

  useEffect(() => {
    const target = overdriveEnabled ? overdrive.current : masterGain.current
    if (!target) return
    for (const [id, gain] of soundGains.current) {
      gain.disconnect()
      const filter = soundFilters.current.get(id)
      if (filter) {
        filter.disconnect()
        gain.connect(filter)
        const drive = soundDrives.current.get(id)
        drive?.disconnect()
        if (soundQuality === 'roughcomms' && drive) {
          filter.connect(drive)
          drive.connect(target)
        } else {
          filter.connect(target)
        }
      } else {
        gain.connect(target)
      }
    }
    if (processAudioGain.current) {
      processAudioGain.current.disconnect()
      processAudioGain.current.connect(target)
    }
    routeMicrophoneFromEffect()
  }, [overdriveEnabled, microphoneEffect, soundQuality])

  useEffect(() => {
    for (const filter of soundFilters.current.values()) {
      filter.type = soundQuality === 'roughcomms' ? 'bandpass' : 'lowpass'
      filter.frequency.setTargetAtTime(qualityCutoffs[soundQuality], filter.context.currentTime, 0.04)
      filter.Q.value = soundQuality === 'roughcomms' ? 0.75 : 0.707
    }
  }, [soundQuality])

  useEffect(() => {
    const refreshOutputs = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setOutputs(devices.filter((device) => device.kind === 'audiooutput'))
        setInputs(devices.filter((device) => device.kind === 'audioinput'))
      } catch {
        setNotice('Could not load audio devices.')
      }
    }

    void refreshOutputs()
    navigator.mediaDevices?.addEventListener('devicechange', refreshOutputs)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshOutputs)
  }, [])

  useEffect(() => {
    const refreshAudioSources = async () => {
      if (!window.soundboard?.listAudioSources) return
      try {
        const sources = await window.soundboard.listAudioSources()
        setAudioSources(sources)
      } catch {
        setNotice('Could not list running apps for audio capture.')
      }
    }

    void refreshAudioSources()
    const timer = window.setInterval(() => void refreshAudioSources(), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => {
    microphoneStream.current?.getTracks().forEach((track) => track.stop())
    void audioContext.current?.close()
  }, [])

  const ensureAudioGraph = () => {
    if (!audioContext.current) {
      const context = new AudioContext()
      const master = context.createGain()
      const saturator = context.createWaveShaper()
      const radioFilter = context.createBiquadFilter()
      const microphoneToneFilter = context.createBiquadFilter()
      const radioDrive = context.createWaveShaper()
      const cookedDrive = context.createWaveShaper()
      const robotModulator = context.createGain()
      const modulationDepth = context.createGain()
      const oscillator = context.createOscillator()
      const curve = new Float32Array(44100)
      const radioCurve = new Float32Array(4096)
      const cookedCurve = new Float32Array(4096)
      const amount = 24
      const edge = ((3 + amount) * 20 * Math.PI / 180) / (Math.PI + amount)
      for (let index = 0; index < curve.length; index += 1) {
        const sample = (index * 2) / curve.length - 1
        const shaped = ((3 + amount) * sample * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(sample))
        curve[index] = shaped / edge
      }
      for (let index = 0; index < radioCurve.length; index += 1) {
        const sample = (index * 2) / radioCurve.length - 1
        radioCurve[index] = Math.tanh(sample * 4) / Math.tanh(4)
      }
      for (let index = 0; index < cookedCurve.length; index += 1) {
        const sample = (index * 2) / cookedCurve.length - 1
        const clipped = Math.max(-1, Math.min(1, sample * 3.2))
        cookedCurve[index] = Math.round(clipped * 18) / 18
      }
      saturator.curve = curve
      saturator.oversample = '4x'
      radioFilter.type = 'bandpass'
      radioFilter.frequency.value = 1650
      radioFilter.Q.value = 0.75
      radioDrive.curve = radioCurve
      radioDrive.oversample = '2x'
      cookedDrive.curve = cookedCurve
      cookedDrive.oversample = 'none'
      oscillator.frequency.value = 28
      modulationDepth.gain.value = 0.42
      robotModulator.gain.value = 0.55
      oscillator.connect(modulationDepth)
      modulationDepth.connect(robotModulator.gain)
      oscillator.start()
      master.gain.value = volume / 100
      saturator.connect(master)
      master.connect(context.destination)
      audioContext.current = context
      masterGain.current = master
      overdrive.current = saturator
      microphoneFilter.current = radioFilter
      microphoneTone.current = microphoneToneFilter
      microphoneDrive.current = radioDrive
      microphoneCookedDrive.current = cookedDrive
      microphoneModulator.current = robotModulator
    }

    const context = audioContext.current as SinkAudioContext
    if (context.state === 'suspended') void context.resume()
    if (context.setSinkId) {
      void context.setSinkId(selectedOutput).catch(() => {
        setNotice('Could not switch the audio output device.')
      })
    }
    return context
  }

  const addSoundFiles = (files: File[]) => {
    const items = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      src: URL.createObjectURL(file),
      extension: file.name.split('.').pop()?.toUpperCase() ?? 'AUDIO',
    }))
    addImportedSounds(items)
    setNotice(items.length ? `Added ${items.length} sound${items.length === 1 ? '' : 's'}.` : '')
  }

  const addImportedSounds = (items: SoundItem[]) => {
    setSounds((current) => [...current, ...items])
    setHotkeys((current) => {
      const next = { ...current }
      const used = new Set(Object.values(next))
      for (const [index, item] of items.entries()) {
        const key = [...'1234567890'].find((candidate) => !used.has(candidate))
        if (key) {
          next[item.id] = key
          used.add(key)
        }
        if (index >= 9) break
      }
      return next
    })
  }

  const importSounds = async () => {
    setNotice('')
    if (!window.soundboard) {
      fileInputRef.current?.click()
      return
    }

    const sources = await window.soundboard.pickAudioFiles()
    const items = sources.map((src) => {
      const fileName = decodeURIComponent(src.split('/').pop() ?? 'Sound')
      return {
        id: crypto.randomUUID(),
        name: fileName.replace(/\.[^.]+$/, ''),
        src,
        extension: fileName.split('.').pop()?.toUpperCase() ?? 'AUDIO',
      }
    })
    addImportedSounds(items)
    setNotice(items.length ? `Added ${items.length} sound${items.length === 1 ? '' : 's'}.` : '')
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    addSoundFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const openSoundArchive = () => {
    if (window.soundboard?.openSoundArchive) {
      void window.soundboard.openSoundArchive()
      return
    }
    window.open(soundArchiveUrl, '_blank', 'noopener,noreferrer')
  }

  const startMicrophone = async () => {
    try {
      const audioConstraint = selectedInput === 'default'
        ? true
        : { deviceId: { exact: selectedInput } }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })
      const context = ensureAudioGraph()
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      gain.gain.value = micVolume / 100
      source.connect(gain)
      microphoneStream.current = stream
      microphoneSource.current = source
      microphoneGain.current = gain
      routeMicrophone()
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputs(devices.filter((device) => device.kind === 'audioinput'))
      setMicrophoneEnabled(true)
      setNotice('')
    } catch {
      microphoneStream.current?.getTracks().forEach((track) => track.stop())
      microphoneStream.current = null
      setNotice('Microphone access failed. Check Windows permissions and your input device.')
    }
  }

  const stopMicrophone = () => {
    microphoneSource.current?.disconnect()
    microphoneGain.current?.disconnect()
    microphoneFilter.current?.disconnect()
    microphoneTone.current?.disconnect()
    microphoneDrive.current?.disconnect()
    microphoneCookedDrive.current?.disconnect()
    microphoneModulator.current?.disconnect()
    microphoneStream.current?.getTracks().forEach((track) => track.stop())
    microphoneSource.current = null
    microphoneGain.current = null
    microphoneStream.current = null
    setMicrophoneEnabled(false)
  }

  const stopProcessAudio = () => {
    removeProcessAudioListener.current?.()
    removeProcessAudioListener.current = null
    processAudioNode.current?.disconnect()
    processAudioGain.current?.disconnect()
    processAudioNode.current = null
    processAudioGain.current = null
    void window.soundboard?.stopProcessAudio?.()
    setProcessAudioEnabled(false)
  }

  const startProcessAudio = async () => {
    const processId = Number(selectedAudioSource)
    if (!Number.isInteger(processId) || processId <= 0 || !window.soundboard?.startProcessAudio || !window.soundboard.onProcessAudioData) {
      setNotice('Select a running app in the desktop app to capture its audio.')
      return
    }

    try {
      const context = ensureAudioGraph()
      if (!processAudioWorkletLoaded.current) {
        const processorSource = `
          class ProcessAudioProcessor extends AudioWorkletProcessor {
            constructor() {
              super()
              this.chunks = []
              this.offset = 0
              this.port.onmessage = ({ data }) => {
                const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
                this.chunks.push(new Int16Array(bytes.slice().buffer))
                if (this.chunks.length > 24) {
                  this.chunks.shift()
                  this.offset = 0
                }
              }
            }
            process(_inputs, outputs) {
              const output = outputs[0]
              const left = output[0]
              const right = output[1] || left
              for (let frame = 0; frame < left.length; frame += 1) {
                let chunk = this.chunks[0]
                if (!chunk || this.offset * 2 + 1 >= chunk.length) {
                  if (chunk) this.chunks.shift()
                  this.offset = 0
                  chunk = this.chunks[0]
                }
                if (!chunk) {
                  left[frame] = 0
                  right[frame] = 0
                  continue
                }
                const sampleIndex = this.offset * 2
                left[frame] = chunk[sampleIndex] / 32768
                right[frame] = chunk[sampleIndex + 1] / 32768
                this.offset += 1
              }
              return true
            }
          }
          registerProcessor('process-audio-capture', ProcessAudioProcessor)
        `
        const moduleUrl = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }))
        try {
          await context.audioWorklet.addModule(moduleUrl)
          processAudioWorkletLoaded.current = true
        } finally {
          URL.revokeObjectURL(moduleUrl)
        }
      }

      const node = new AudioWorkletNode(context, 'process-audio-capture', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
      const gain = context.createGain()
      gain.gain.value = processAudioVolume / 100
      gain.connect(overdriveEnabled ? overdrive.current! : masterGain.current!)
      node.connect(gain)
      removeProcessAudioListener.current = window.soundboard.onProcessAudioData((chunk) => node.port.postMessage(chunk))
      await window.soundboard.startProcessAudio(processId)
      processAudioNode.current = node
      processAudioGain.current = gain
      setProcessAudioEnabled(true)
      setNotice('App audio is now mixed into the selected output.')
    } catch {
      stopProcessAudio()
      setNotice('Could not capture that app. Try another running app or check Windows support.')
    }
  }

  useEffect(() => () => {
    removeProcessAudioListener.current?.()
    void window.soundboard?.stopProcessAudio?.()
  }, [])

  const playSound = (sound: SoundItem) => {
    const audio = audioRefs.current.get(sound.id)
    if (!audio) return
    const context = ensureAudioGraph()
    if (!soundSources.current.has(sound.id)) {
      const source = context.createMediaElementSource(audio)
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      const drive = context.createWaveShaper()
      const driveCurve = new Float32Array(4096)
      for (let index = 0; index < driveCurve.length; index += 1) {
        const sample = (index * 2) / driveCurve.length - 1
        driveCurve[index] = Math.tanh(sample * 4) / Math.tanh(4)
      }
      filter.type = soundQuality === 'roughcomms' ? 'bandpass' : 'lowpass'
      filter.frequency.value = qualityCutoffs[soundQuality]
      filter.Q.value = soundQuality === 'roughcomms' ? 0.75 : 0.707
      drive.curve = driveCurve
      drive.oversample = '2x'
      source.connect(gain)
      gain.connect(filter)
      const target = overdriveEnabled ? overdrive.current! : masterGain.current!
      if (soundQuality === 'roughcomms') {
        filter.connect(drive)
        drive.connect(target)
      } else {
        filter.connect(target)
      }
      soundSources.current.set(sound.id, source)
      soundGains.current.set(sound.id, gain)
      soundFilters.current.set(sound.id, filter)
      soundDrives.current.set(sound.id, drive)
    }
    audio.currentTime = 0
    audio.volume = 1
    void audio.play().then(() => {
      setActiveSounds((current) => new Set(current).add(sound.id))
      setNotice('')
    }).catch(() => {
      setNotice(`Could not play “${sound.name}”.`)
    })
  }

  const playSoundFromHotkey = useEffectEvent(playSound)

  useEffect(() => {
    if (!hotkeysEnabled && !recordingSoundId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (recordingSoundId) {
        if (event.key === 'Escape') {
          setRecordingSoundId(null)
          return
        }
        if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
        event.preventDefault()
        const key = event.key.toLowerCase()
        const duplicate = Object.entries(hotkeys).find(([id, value]) => id !== recordingSoundId && value === key)
        if (duplicate) {
          setNotice(`That key is already assigned to ${sounds.find((sound) => sound.id === duplicate[0])?.name ?? 'another sound'}.`)
        } else {
          setHotkeys((current) => ({ ...current, [recordingSoundId]: key }))
          setNotice('Hotkey updated.')
        }
        setRecordingSoundId(null)
        return
      }

      const target = event.target
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const soundId = Object.entries(hotkeys).find(([, value]) => value === key)?.[0]
      const sound = sounds.find((item) => item.id === soundId)
      if (sound) {
        event.preventDefault()
        playSoundFromHotkey(sound)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeysEnabled, hotkeys, recordingSoundId, sounds])

  const stopAll = () => {
    for (const audio of audioRefs.current.values()) {
      audio.pause()
      audio.currentTime = 0
    }
    setActiveSounds(new Set())
  }

  const removeSound = (id: string) => {
    const sound = sounds.find((item) => item.id === id)
    if (sound?.src.startsWith('blob:')) URL.revokeObjectURL(sound.src)
    audioRefs.current.get(id)?.pause()
    soundSources.current.get(id)?.disconnect()
    soundGains.current.get(id)?.disconnect()
    soundFilters.current.get(id)?.disconnect()
    soundDrives.current.get(id)?.disconnect()
    audioRefs.current.delete(id)
    soundSources.current.delete(id)
    soundGains.current.delete(id)
    soundFilters.current.delete(id)
    soundDrives.current.delete(id)
    setHotkeys((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setSounds((current) => current.filter((item) => item.id !== id))
    setActiveSounds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const filteredSounds = sounds.filter((sound) => sound.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-name">Nexuz <span>Sound</span></span>
          <span className="brand-mark">
            {logoAvailable ? <img src="./Sound.png" alt="" onError={() => setLogoAvailable(false)} /> : <AudioLines size={22} />}
          </span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item nav-item-active" type="button">
          <AudioLines size={17} /><span>Soundboard</span><span className="nav-count">{sounds.length}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="route-card">
            <span className="route-icon"><Radio size={16} /></span>
            <div><span className="route-title">MICROPHONE ROUTE</span><span className="route-state"><i />{microphoneEnabled ? 'Microphone live' : outputs.length > 1 ? 'Device available' : 'Default output'}</span></div>
          </div>
          <span className="sidebar-version">NEXUZ SOUNDBOARD <span>DESKTOP</span></span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>WORKSPACE</span><span className="breadcrumb-slash">/</span><strong>Soundboard</strong></div>
          <div className="topbar-actions">
            <span className="live-indicator"><i /> AUDIO ENGINE READY</span>
            <button className={`hotkey-switch ${hotkeysEnabled ? 'hotkey-switch-on' : ''}`} type="button" aria-pressed={hotkeysEnabled} title="Toggle keyboard shortcuts" onClick={() => { setHotkeysEnabled((enabled) => !enabled); setRecordingSoundId(null) }}><Keyboard size={14} /><span>HOTKEYS {hotkeysEnabled ? 'ON' : 'OFF'}</span></button>
            <button className="icon-button" type="button" title="Quick setup" aria-label="Quick setup" onClick={() => setNotice('For Discord: set this app’s output to “CABLE Input” and choose “CABLE Output” as your microphone. VB-CABLE is a separate driver.')}><CircleHelp size={17} /></button>
          </div>
        </header>

        <section className="workspace">
          <div className="page-heading">
            <div><div className="eyebrow">AUDIO CONTROL / 01</div><h1>Soundboard<span className="heading-period">.</span></h1><p className="page-subtitle">Your sounds. Straight to the selected output.</p></div>
            <div className="page-heading-actions">
              <button className="archive-button" type="button" title="Open sound archive" onClick={openSoundArchive}><ExternalLink size={15} /><span>Sound archive</span></button>
              <button className="import-button" type="button" onClick={() => void importSounds()}><Plus size={17} strokeWidth={2.5} /><span>Import sounds</span></button>
            </div>
          </div>

          <section className="output-strip" aria-label="Audio output">
            <div className="output-leading"><span className="output-icon"><Headphones size={18} /></span><div className="output-copy"><span className="control-label">AUDIO OUTPUT</span><strong>Output device</strong></div></div>
            <label className="device-select-wrap">
              <select value={selectedOutput} onChange={(event) => setSelectedOutput(event.target.value)} aria-label="Select audio output">
                <option value="default">Windows default device</option>
                {outputs.filter((device) => device.deviceId !== 'default').map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || 'Audio device'}</option>)}
              </select><ChevronDown size={15} />
            </label>
            <span className="output-divider" />
            <div className="volume-control">
              <button className="icon-button volume-button" type="button" title={volume === 0 ? 'Unmute' : 'Mute'} aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => setVolume((current) => current === 0 ? 80 : 0)}>{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
              <input aria-label="Sound volume" type="range" min="0" max="200" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
              <span className="volume-value">{volume}%</span>
            </div>
            <button className="stop-button" type="button" onClick={stopAll} title="Stop all sounds"><Pause size={14} fill="currentColor" /><span>STOP ALL</span></button>
          </section>

          <section className="mic-strip" aria-label="Microphone input">
            <div className="mic-leading">
              <span className={`mic-icon ${microphoneEnabled ? 'mic-icon-active' : ''}`}>{microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}</span>
              <div className="mic-copy"><span className="control-label">MIC INPUT</span><strong>{microphoneEnabled ? 'Microphone live' : 'Microphone passthrough'}</strong></div>
            </div>
            <label className="mic-select-wrap">
              <select value={selectedInput} onChange={(event) => setSelectedInput(event.target.value)} disabled={microphoneEnabled} aria-label="Select microphone">
                <option value="default">Windows default microphone</option>
                {inputs.filter((device) => device.deviceId !== 'default').map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
              </select><ChevronDown size={15} />
            </label>
            <div className="mic-level"><span>MIC LEVEL</span><input aria-label="Microphone volume" type="range" min="0" max="200" value={micVolume} onChange={(event) => setMicVolume(Number(event.target.value))} /><b>{micVolume}%</b></div>
            <button className={`effect-toggle ${overdriveEnabled ? 'effect-toggle-on' : ''}`} type="button" aria-pressed={overdriveEnabled} title="Overdrive effect" onClick={() => setOverdriveEnabled((enabled) => !enabled)}><AudioWaveform size={15} /><span>OVERDRIVE</span></button>
            <label className="mic-select-wrap mic-effect-select">
              <select value={microphoneEffect} onChange={(event) => setMicrophoneEffect(event.target.value as MicrophoneEffect)} aria-label="Microphone voice effect">
                <option value="clean">Clean voice</option>
                <option value="radio">Radio</option>
                <option value="deep">Deep voice</option>
                <option value="bright">Bright voice</option>
                <option value="robot">Robot</option>
                <option value="cooked">Cooked webcam</option>
              </select><ChevronDown size={15} />
            </label>
            <button className={`mic-toggle ${microphoneEnabled ? 'mic-toggle-on' : ''}`} type="button" onClick={() => microphoneEnabled ? stopMicrophone() : void startMicrophone()}>{microphoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}<span>{microphoneEnabled ? 'MIC OFF' : 'MIC ON'}</span></button>
          </section>
          <p className="setup-note">Voice chat: set app output to <strong>CABLE Input</strong>, then select <strong>CABLE Output</strong> as your microphone in Discord.</p>

          <section className="app-audio-strip" aria-label="Application audio capture">
            <div className="app-audio-leading"><span className="app-audio-icon"><AudioLines size={17} /></span><div><span className="control-label">APP AUDIO</span><strong>{processAudioEnabled ? 'Capturing process audio' : 'Choose a running app'}</strong></div></div>
            <label className="app-audio-source">
              <select value={selectedAudioSource} onChange={(event) => setSelectedAudioSource(event.target.value)} disabled={processAudioEnabled} aria-label="Select app audio source">
                <option value="">Select running app...</option>
                {audioSources.map((source) => <option value={source.id} key={source.id}>{source.name} (PID {source.id})</option>)}
              </select><ChevronDown size={15} />
            </label>
            <div className="app-audio-level"><span>APP LEVEL</span><input aria-label="App audio volume" type="range" min="0" max="200" value={processAudioVolume} onChange={(event) => setProcessAudioVolume(Number(event.target.value))} /><b>{processAudioVolume}%</b></div>
            <button className={`mic-toggle ${processAudioEnabled ? 'mic-toggle-on' : ''}`} type="button" onClick={() => processAudioEnabled ? stopProcessAudio() : void startProcessAudio()}>{processAudioEnabled ? <Pause size={15} /> : <Play size={15} />}<span>{processAudioEnabled ? 'STOP APP AUDIO' : 'CAPTURE APP AUDIO'}</span></button>
          </section>
          <p className="setup-note">Captured app audio keeps playing normally and is mixed with your microphone into the selected output.</p>

          <div className="section-heading">
            <div className="section-title-group"><span className="section-index">01</span><h2>Your sounds</h2><span className="sound-total">{sounds.length.toString().padStart(2, '0')}</span></div>
            <div className="quality-control" role="group" aria-label="Sound quality">
              <span>QUALITY</span>
              <div className="quality-options">
                {([
                  ['original', 'Original'],
                  ['warm', 'Warm'],
                  ['telephone', 'Phone'],
                  ['lofi', 'Lo-Fi'],
                  ['roughcomms', 'Rough Comms'],
                ] as const).map(([value, label]) => (
                  <button className={soundQuality === value ? 'quality-option quality-option-active' : 'quality-option'} type="button" aria-pressed={soundQuality === value} key={value} onClick={() => setSoundQuality(value)}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {sounds.length > 0 && <label className="sound-search"><Search size={16} /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search sounds..." aria-label="Search sounds" /><span>{filteredSounds.length} / {sounds.length}</span></label>}

          {sounds.length > 0 && filteredSounds.length > 0 ? (
            <div className="sound-grid">
              {filteredSounds.map((sound, index) => (
                <article className={`sound-tile ${activeSounds.has(sound.id) ? 'sound-tile-playing' : ''}`} key={sound.id}>
                  <button className="sound-trigger" type="button" onClick={() => playSound(sound)} aria-label={`Play ${sound.name}`}>
                    <span className="tile-topline"><span className="tile-number">{String(index + 1).padStart(2, '0')}</span><span className="tile-format">{sound.extension}</span></span>
                    <span className="tile-wave"><AudioLines size={28} strokeWidth={1.7} /></span>
                    <span className="tile-name">{sound.name}</span>
                    <span className="tile-bottomline"><span>{activeSounds.has(sound.id) ? 'ON AIR' : 'SOUND CLIP'}</span><span className="tile-play"><Play size={13} fill="currentColor" /></span></span>
                  </button>
                  <button className={`tile-shortcut ${recordingSoundId === sound.id ? 'tile-shortcut-recording' : ''}`} type="button" title={recordingSoundId === sound.id ? 'Press a key, or Escape to cancel' : 'Change sound hotkey'} aria-label={recordingSoundId === sound.id ? 'Press a key for this sound' : `Change hotkey for ${sound.name}`} onClick={() => setRecordingSoundId(sound.id)}>{recordingSoundId === sound.id ? 'PRESS' : hotkeys[sound.id]?.toUpperCase() ?? '+'}</button>
                  <button className="delete-sound" type="button" title={`Remove ${sound.name}`} aria-label={`Remove ${sound.name}`} onClick={() => removeSound(sound.id)}><X size={14} /></button>
                  <audio ref={(element) => { if (element) audioRefs.current.set(sound.id, element); else audioRefs.current.delete(sound.id) }} src={sound.src} onEnded={() => setActiveSounds((current) => { const next = new Set(current); next.delete(sound.id); return next })} onError={() => setNotice(`Could not find the file for “${sound.name}”.`)} />
                </article>
              ))}
              <button className="add-tile" type="button" onClick={() => void importSounds()}><span className="add-tile-icon"><Plus size={19} /></span><span>Add sound</span></button>
            </div>
          ) : sounds.length > 0 ? (
            <div className="search-empty">No sounds match “{searchQuery}”.</div>
          ) : (
            <div className="empty-state">
              <div className="empty-art"><span className="empty-ring empty-ring-one" /><span className="empty-ring empty-ring-two" /><AudioLines size={32} strokeWidth={1.5} /></div>
              <span className="empty-kicker">YOUR BOARD IS READY</span>
              <h3>Add your first sound.</h3>
              <p>MP3, WAV, M4A and MP4 audio are supported.</p>
              <button className="empty-import" type="button" onClick={() => void importSounds()}><Plus size={16} /> Choose audio files</button>
            </div>
          )}

          <div className={`notice ${notice ? 'notice-visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={14} /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></>}</div>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="audio/*,video/mp4,.mp4,.m4a" multiple onChange={handleFileInput} />
          <footer className="workspace-footer"><span><span className="footer-dot" />LOCAL AUDIO SESSION</span><span className="local-processing"><span className="footer-dot" />LOCALLY PROCESSED</span></footer>
        </section>
      </main>
    </div>
  )
}

export default App
