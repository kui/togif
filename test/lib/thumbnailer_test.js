import test from 'ava'
import del from 'del'
import { spawn } from 'child_process'

import path from 'path'
import fs from 'fs'

import Thumbnailer from './../../src/lib/thumbnailer'
import { tmpDir } from './../../src/lib/util'

function hasFfmpeg () {
  return new Promise(resolve => {
    try {
      spawn('ffmpeg', ['-version'])
        .on('error', err => resolve(!err))
        .on('close', code => resolve(code === 0))
    } catch (e) {
      resolve(false)
    }
  })
}

test(async t => {
  if (!await hasFfmpeg()) {
    return
  }

  const thumbnailer = new Thumbnailer()
  const videoFile = path.resolve(__dirname, '..', 'big_buck_bunny.mp4')
  const destDir = await tmpDir({ prefix: 'test-' })
  const execution = thumbnailer.exec({
    videoFile,
    intervalMillis: 10000,
    destDir,
    ext: 'jpg'
  })
  const files = []
  execution.onNewThumbnail(async (thumbnail) => {
    console.log('thumbnail[%d]: ', files.length, thumbnail)
    files.push(thumbnail.file)
    t.notThrows(() => fs.statSync(thumbnail.file))
  })
  await execution.donePromise

  t.is(files.length, 7)

  await del(destDir, { force: true })
})
