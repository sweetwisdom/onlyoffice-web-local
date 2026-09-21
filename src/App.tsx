import { HomePage } from './HomePage'
import { EditorPage } from './EditorPage'
import { usePath } from './route'

export default function App() {
  const { path, navigate } = usePath()
  const isEditor = path.startsWith('/editor')

  if (isEditor) {
    return <EditorPage path={path} navigate={navigate} />
  }
  return <HomePage navigate={navigate} />
}
