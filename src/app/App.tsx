import { HashRouter, Route, Routes } from 'react-router'
import { EntryPage } from './EntryPage'
import { LandingPage } from './LandingPage'
import { Layout } from './Layout'
import { LibraryPage } from './LibraryPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="entry/:id" element={<EntryPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
