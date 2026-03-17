import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface PlaceResult {
  title: string;
  uri: string;
  reviewSnippets?: any[];
  lat?: number;
  lng?: number;
  address?: string;
}

export interface SearchResponse {
  text: string;
  places: PlaceResult[];
}

export async function searchPlaces(
  query: string, 
  location: string, 
  latLng?: { latitude: number; longitude: number }
): Promise<SearchResponse> {
  const prompt = `Perform a methodical, comprehensive scan to find ALL ${query} in the area of ${location}. 
  This is a large-scale area scan (approx 8km radius). 
  
  CRITICAL: I need a high-volume scan. Please return as many relevant results as possible, aiming for 50-100 locations if they exist. Do not stop at 20.
  
  For each place found, please provide:
  1. The exact name of the place.
  2. A brief, informative description.
  3. The precise GPS coordinates in the format [LAT: decimal, LNG: decimal].
  
  Example: [LAT: 37.7749, LNG: -122.4194]
  
  Structure your response with:
  - A high-level executive summary of the findings (density, distribution, notable clusters).
  - A detailed, numbered list of ALL locations found with their coordinates.`;

  const config: any = {
    tools: [{ googleMaps: {} }],
  };

  if (latLng) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: latLng.latitude,
          longitude: latLng.longitude,
        },
      },
    };
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config,
  });

  const text = response.text || "No description provided.";
  
  const places: PlaceResult[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  // 1. Extract all locations from the text response using regex
  // We look for patterns like "1. Place Name: [LAT: ..., LNG: ...]" or similar
  const placeRegex = /(?:\d+\.\s+)?([^:\n]+):\s*\[LAT:\s*(-?\d+\.\d+),\s*LNG:\s*(-?\d+\.\d+)\]/g;
  let match;
  while ((match = placeRegex.exec(text)) !== null) {
    places.push({
      title: match[1].trim(),
      lat: parseFloat(match[2]),
      lng: parseFloat(match[3]),
      uri: `https://www.google.com/maps/search/?api=1&query=${match[2]},${match[3]}`,
    });
  }

  // 2. If we didn't find many in the text, fallback to grounding chunks
  if (places.length < 5 && chunks.length > 0) {
    chunks.forEach((chunk) => {
      if (chunk.maps) {
        // Check if this place is already added (by title)
        const exists = places.some(p => p.title.toLowerCase() === chunk.maps!.title?.toLowerCase());
        if (!exists) {
          places.push({
            title: chunk.maps.title || "Unknown Place",
            uri: chunk.maps.uri || "#",
            reviewSnippets: chunk.maps.placeAnswerSources?.reviewSnippets || [],
          });
        }
      }
    });
  }

  return { text, places };
}
