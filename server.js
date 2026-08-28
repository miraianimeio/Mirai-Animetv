import express from "express";

const app = express();

app.get("/api/manga", async (req, res) => {
  try {
    const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
    const url = `https://api.mangadex.org/manga?${queryString}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "MiraAnimeApp/1.0"
      }
    });

    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch manga data" });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Proxy running on http://localhost:3000");
});