import { registerApp } from './registry'
import notes from './notes'
import todo from './todo'
import time from './time'
import phrases from './phrases'
import net from './net'
import clipboard from './clipboard'
import materialBox from './materialBox'

// 新增岛内应用：在下方 registerApp(...) 即可
registerApp(notes)
registerApp(todo)
registerApp(time)
registerApp(phrases)
registerApp(net)
registerApp(clipboard)
registerApp(materialBox)
