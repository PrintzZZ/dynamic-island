import { registerApp } from './registry'
import notes from './notes'
import clock from './clock'
import todo from './todo'
import timer from './timer'
import phrases from './phrases'

// 新增岛内应用：在下方 registerApp(...) 即可
registerApp(notes)
registerApp(clock)
registerApp(todo)
registerApp(timer)
registerApp(phrases)
