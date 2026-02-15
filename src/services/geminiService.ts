import { GoogleGenAI, Type } from "@google/genai";
import { Team } from "../types";

const getApiKey = () => { try { if (typeof process !== 'undefined' && process.env) { return process.env.API_KEY || ''; } } catch (e) { } return ''; };
const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateSmartFixture = async (teams: Team[], startDate: string, endDate: string, matchDays: string[] = []): Promise<{ groups: any, fixtures: any[] }> => {
  try {
    if (!ai || !apiKey) { return generateBasicFixture(teams, startDate, endDate, matchDays); }
    const teamNames = teams.map(t => ({ id: t.id, name: t.name }));
    const daysString = matchDays.length > 0 ? matchDays.join(', ') : "any day";
    const prompt = `Create a volleyball tournament fixture for these teams: ${JSON.stringify(teamNames)}. The tournament runs from ${startDate} to ${endDate}. IMPORTANT RULES: 1. Divide teams into balanced groups. 2. Generate a match schedule. 3. Matches MUST ONLY be scheduled on: ${daysString}. 4. Distribute matches evenly. 5. Return JSON with 'groupsArray' and 'fixtures'.`;
    let retries = 3; let lastError = null;
    while (retries > 0) {
        try {
            const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { groupsArray: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { groupName: { type: Type.STRING }, teamIds: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["groupName", "teamIds"] } }, fixtures: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, teamAId: { type: Type.STRING }, teamBId: { type: Type.STRING }, group: { type: Type.STRING } }, required: ["date", "teamAId", "teamBId", "group"] } } }, required: ["groupsArray", "fixtures"] } } });
            let text = response.text; if (!text) throw new Error("Empty response");
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(text);
            const groupsMap: Record<string, string[]> = {};
            if (data.groupsArray && Array.isArray(data.groupsArray)) { data.groupsArray.forEach((g: any) => { if (g.groupName && g.teamIds) { groupsMap[g.groupName] = g.teamIds; } }); }
            const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];
            return { groups: groupsMap, fixtures };
        } catch (err: any) { lastError = err; retries--; if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); }
    }
    throw lastError || new Error("All retry attempts failed");
  } catch (error) { return generateBasicFixture(teams, startDate, endDate, matchDays); }
};

export const generateBasicFixture = (teams: Team[], startDate: string, endDate: string, matchDays: string[]) => {
  const groups: Record<string, string[]> = {}; const fixtures: any[] = [];
  const dates: string[] = [];
  const start = isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate); 
  const end = isNaN(new Date(endDate).getTime()) ? new Date(start.getTime() + 86400000 * 30) : new Date(endDate);
  const dayMap: Record<string, number> = { 'Domingo': 0, 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6 };
  const allowedDayIndices = matchDays.length > 0 ? matchDays.map(d => dayMap[d]).filter(d => d !== undefined) : null;
  let current = new Date(start); let safetyCounter = 0;
  while (current <= end && safetyCounter < 365) {
      const dayIndex = current.getUTCDay();
      if (!allowedDayIndices || allowedDayIndices.length === 0 || allowedDayIndices.includes(dayIndex)) { dates.push(current.toISOString().split('T')[0]); }
      current.setUTCDate(current.getUTCDate() + 1); safetyCounter++;
  }
  if (dates.length === 0) dates.push(startDate);
  const generateGroupFixtures = (groupTeams: Team[], groupName: string) => {
      let dateIndex = 0;
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          fixtures.push({ date: dates[dateIndex % dates.length], teamAId: groupTeams[i].id, teamBId: groupTeams[j].id, group: groupName });
          dateIndex++;
        }
      }
  };
  if (teams.length > 8) {
      const half = Math.ceil(teams.length / 2); const groupA = teams.slice(0, half); const groupB = teams.slice(half);
      groups["Grupo A"] = groupA.map(t => t.id); groups["Grupo B"] = groupB.map(t => t.id);
      generateGroupFixtures(groupA, "Grupo A"); generateGroupFixtures(groupB, "Grupo B");
  } else { groups["Grupo Único"] = teams.map(t => t.id); generateGroupFixtures(teams, "Grupo Único"); }
  return { groups, fixtures };
};