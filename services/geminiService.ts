
import { GoogleGenAI, Type } from "@google/genai";
import { Team } from "../types";

// Safely retrieve API Key without crashing if process is not defined in browser
const getApiKey = () => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      return process.env.API_KEY || '';
    }
  } catch (e) {
    // Ignore error in browser environments where process is undefined
  }
  return '';
};

const apiKey = getApiKey();

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateSmartFixture = async (
  teams: Team[],
  startDate: string,
  endDate: string,
  matchDays: string[] = [] 
): Promise<{ groups: any, fixtures: any[] }> => {
  
  try {
    // Use Mock if no API key is present
    if (!ai || !apiKey) {
      console.warn("No API Key or AI client, returning mock fixture");
      return generateBasicFixture(teams, startDate, endDate, matchDays);
    }

    const teamNames = teams.map(t => ({ id: t.id, name: t.name }));
    const daysString = matchDays.length > 0 ? matchDays.join(', ') : "any day";
    
    const prompt = `
      Create a volleyball tournament fixture for these teams: ${JSON.stringify(teamNames)}.
      The tournament runs from ${startDate} to ${endDate}.
      
      IMPORTANT RULES:
      1. Divide teams into balanced groups (Group A, Group B, etc.) if more than 5 teams.
      2. Generate a match schedule (fixture) ensuring all teams in a group play each other once.
      3. **CRITICAL**: Matches MUST ONLY be scheduled on the following days of the week: ${daysString}.
      4. Distribute matches evenly across the available dates within the range.
      5. Return JSON with 'groupsArray' (list of groups with name and teamIds) and 'fixtures'.
    `;

    // Retry logic for robust API calls
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
        try {
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    groupsArray: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          groupName: { type: Type.STRING },
                          teamIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                          }
                        },
                        required: ["groupName", "teamIds"]
                      }
                    },
                    fixtures: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          date: { type: Type.STRING, description: "YYYY-MM-DD format" },
                          teamAId: { type: Type.STRING },
                          teamBId: { type: Type.STRING },
                          group: { type: Type.STRING }
                        },
                        required: ["date", "teamAId", "teamBId", "group"]
                      }
                    }
                  },
                  required: ["groupsArray", "fixtures"]
                }
              }
            });

            let text = response.text;
            if (!text) throw new Error("Empty response from AI");
            
            // Clean up potential markdown formatting from AI
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const data = JSON.parse(text);
            
            // Transform groupsArray back to Map for the app: { "Group A": ["id1", "id2"] }
            const groupsMap: Record<string, string[]> = {};
            if (data.groupsArray && Array.isArray(data.groupsArray)) {
                data.groupsArray.forEach((g: any) => {
                    if (g.groupName && g.teamIds) {
                        groupsMap[g.groupName] = g.teamIds;
                    }
                });
            }

            // Safety check for fixtures
            const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];

            return { groups: groupsMap, fixtures };

        } catch (err: any) {
            console.warn(`Gemini attempt failed (${retries} left):`, err.message);
            lastError = err;
            retries--;
            if (retries > 0) {
                // Exponential backoff: 1s, 2s, 4s...
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
            }
        }
    }
    
    throw lastError || new Error("All retry attempts failed");

  } catch (error) {
    console.error("Gemini Service Failed - Using Fallback Generator", error);
    // Fallback to mock generation if AI fails entirely
    return generateBasicFixture(teams, startDate, endDate, matchDays);
  }
};

export const analyzeMatchStats = async (matchStats: any) => {
    if (!ai || !apiKey) return "Análisis de IA no disponible (Falta API Key).";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Analyze these volleyball match statistics and provide a brief, professional commentary in Spanish highlighting the MVP and key moments: ${JSON.stringify(matchStats)}`
        });
        return response.text;
    } catch (e) {
        return "Error generando análisis.";
    }
}

// Robust Fallback Generator (Exported for App.tsx usage)
export const generateBasicFixture = (teams: Team[], startDate: string, endDate: string, matchDays: string[]) => {
  const groups: Record<string, string[]> = {};
  const fixtures: any[] = [];
  
  // 1. Calculate available dates correctly using UTC to avoid timezone shifts
  const dates: string[] = [];
  // Ensure valid date objects
  const start = isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate); 
  const end = isNaN(new Date(endDate).getTime()) ? new Date(start.getTime() + 86400000 * 30) : new Date(endDate);
  
  // Mapping Spanish days to JS getUTCDay() (0=Sunday, 1=Monday...)
  const dayMap: Record<string, number> = {
      'Domingo': 0, 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6
  };
  
  const allowedDayIndices = matchDays.length > 0 ? matchDays.map(d => dayMap[d]).filter(d => d !== undefined) : null;

  let current = new Date(start);
  let safetyCounter = 0;
  
  // Iterate dates (Safe loop limit 365 days)
  while (current <= end && safetyCounter < 365) {
      const dayIndex = current.getUTCDay();
      // If no allowed days specified, allow all. Otherwise check filter.
      if (!allowedDayIndices || allowedDayIndices.length === 0 || allowedDayIndices.includes(dayIndex)) {
          dates.push(current.toISOString().split('T')[0]);
      }
      current.setUTCDate(current.getUTCDate() + 1);
      safetyCounter++;
  }
  
  // If no matching dates found (e.g. range too short or no match), fallback to start date to ensure fixture isn't empty
  if (dates.length === 0) dates.push(startDate);

  // 2. Generate Matches (Round Robin logic)
  const generateGroupFixtures = (groupTeams: Team[], groupName: string) => {
      let dateIndex = 0;
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          fixtures.push({
            date: dates[dateIndex % dates.length],
            teamAId: groupTeams[i].id,
            teamBId: groupTeams[j].id,
            group: groupName
          });
          dateIndex++;
        }
      }
  };

  // Logic: Split into groups if too many teams for a single round robin
  if (teams.length > 8) {
      const half = Math.ceil(teams.length / 2);
      const groupA = teams.slice(0, half);
      const groupB = teams.slice(half);
      
      groups["Grupo A"] = groupA.map(t => t.id);
      groups["Grupo B"] = groupB.map(t => t.id);
      
      generateGroupFixtures(groupA, "Grupo A");
      generateGroupFixtures(groupB, "Grupo B");
  } else {
      groups["Grupo Único"] = teams.map(t => t.id);
      generateGroupFixtures(teams, "Grupo Único");
  }

  return { groups, fixtures };
};
