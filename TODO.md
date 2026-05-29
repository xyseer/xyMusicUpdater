# TODO / Roadmap (Next Version)

## 📥 Downloads & Sources
- [ ] **Keyword Filter**: Implement a mechanism to disallow specific keywords or regex patterns in video/song titles during the discovery/download phase to prevent fetching unwanted tracks (e.g., live versions, instrumentals, covers).
- [ ] **Smart Discovery Sorting**: When discovering via keywords, initially rely on the platform's default "most related" sorting. However, *after* the filtering phase (removing duplicates and unwanted keywords), re-sort the remaining valid candidates by **release date** (newest first), and then fetch the requested quota from the top.

## ⬆️ File Management
- [ ] **Direct File Upload**: Add a feature to the UI allowing users to directly upload local song file(s) and feed them directly into our existing processing, tagging, and storage pipeline.