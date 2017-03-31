// @flow

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import EventEmitter from 'events'
import { sprintf } from 'sprintf-js'

export default class Thumbnailer {
  ffmpegPath: string

  constructor ({
    ffmpegPath = 'ffmpeg'
  }: {
    ffmpegPath: string
  } = {}) {
    this.ffmpegPath = ffmpegPath
  }

  exec ({
    videoFile,
    intervalMillis,
    destDir,
    width,
    fileNamePrefix,
    ext
  }: {
    videoFile: string,
    intervalMillis: number,
    width?: ?number,
    destDir: string,
    fileNamePrefix?: ?string,
    ext: 'jpg' | 'jpeg' | 'png',
  }): ThumbnailerExecution {
    if (!fileNamePrefix) {
      fileNamePrefix = ''
    }

    const filters = [`fps=1000/${intervalMillis}`]
    filters.push('showinfo')
    if (width) {
      filters.push(`scale=${width}x-1`)
    }

    const fileNameFormat = path.join(destDir, `${fileNamePrefix}%06d.${ext}`)
    const process = spawn(this.ffmpegPath, [
      '-i', videoFile,
      '-f', 'image2',
      '-start_number', '0',
      '-vf', filters.join(','),
      fileNameFormat
    ])
    return new ThumbnailerExecution(process, fileNameFormat)
  }
}

class ThumbnailerExecution {
  process: child_process$ChildProcess // eslint-disable-line camelcase
  donePromise: Promise<void>
  eventEmitter: events$EventEmitter

  constructor (process: child_process$ChildProcess, fileNameFormat: string) { // eslint-disable-line camelcase
    this.eventEmitter = new EventEmitter()

    const thumbnails = new Map()

    let isWatcherCloseReserved = false
    this.donePromise = new Promise((resolve, reject) => {
      let done = false
      process.on('error', err => {
        if (done) {
          return
        }
        reject(err)
        done = true
      })
      process.on('exit', (code, signal) => {
        if (done) {
          return
        }
        if (code !== 0) {
          reject(code)
          return
        }
        done = true
      })
      const watcher = fs.watch(path.dirname(fileNameFormat), (eventType, filename) => {
        console.log(eventType, filename)
        if (eventType !== 'rename') {
          return
        }
        const t = thumbnails.get(filename)
        if (!t) {
          return
        }
        thumbnails.delete(filename)
        this.eventEmitter.emit('thumbnail', t)

        if (isWatcherCloseReserved && thumbnails.size === 0) {
          watcher.close()
          console.log('Watcher closed')
          resolve()
        }
      })
    })

    const stdoutLineParser = new LineParser()
    process.stdout.on('data', data => {
      stdoutLineParser.add(data.toString()).forEach(line => this.eventEmitter.emit('stdout', line))
    })

    const stderrLineParser = new LineParser()
    process.stderr.on('data', data => {
      stderrLineParser.add(data.toString()).forEach(line => this.eventEmitter.emit('stderr', line))
    })

    process.on('close', () => {
      isWatcherCloseReserved = true
      const lastStdout = stdoutLineParser.flash()
      if (lastStdout.length !== 0) {
        this.eventEmitter.emit('stdout', lastStdout)
      }
      const lastStderr = stderrLineParser.flash()
      if (lastStderr.length !== 0) {
        this.eventEmitter.emit('stderr', lastStderr)
      }
    })

    this.eventEmitter.on('stderr', line => {
      const m = /^\[Parsed_showinfo.*?\] (.*)/.exec(line)
      if (!m) {
        return
      }

      const entries = m[1].match(/\w+:\s*\w+/g)
      if (!entries || entries.length === 0) {
        return
      }

      const map: Map<string, string> = entries
            .map(e => e.split(/:(.+)/, 2))
            .reduce((m, [k, v]) => { m.set(k, v); return m }, new Map())
      if (!map.has('n')) {
        return
      }

      const n = parseInt(map.get('n'))
      if (!(n >= 0)) { // DO NOT "n < 0" to avoid NaN
        return
      }

      const t: Thumbnail = {
        n,
        file: sprintf(fileNameFormat, n),
        pts: parseInt(map.get('pts')),
        ptsTime: parseInt(map.get('pts_time')),
        pos: parseInt(map.get('pos')),
        size: map.get('s') || ''
      }

      thumbnails.set(path.basename(t.file), t)
    })
  }

  onNewThumbnail (callback: (t: Thumbnail) => any) {
    this.eventEmitter.on('thumbnail', callback)
  }
}

class LineParser {
  buffer: string

  constructor () {
    this.buffer = ''
  }

  add (data): string[] {
    this.buffer += data
    const s = this.buffer.split(/\r?\n/)
    if (s.length === 1) {
      return []
    }
    this.buffer = s[s.length - 1]
    return s.slice(0, s.length - 1)
  }

  flash (): string {
    const l = this.buffer
    this.buffer = ''
    return l
  }
}

type Thumbnail = {
  file: string,
  n: number,
  pts: number,
  ptsTime: number,
  pos: number,
  size: string
}
