import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Tabs, Tab, Paper, Button,
  TextField, Select, MenuItem, InputLabel, FormControl,
  List, ListItem, ListItemText, IconButton, Chip, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  CircularProgress, Card, CardContent, Divider, Grid, CardActionArea,
  Backdrop, FormControlLabel, Checkbox, createTheme, ThemeProvider, CssBaseline, keyframes
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import CodeIcon from '@mui/icons-material/Code';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LoginIcon from '@mui/icons-material/Login';
import LinkIcon from '@mui/icons-material/Link';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TerminalIcon from '@mui/icons-material/Terminal';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Toaster, toast } from 'sonner';

// Interface matching the new backend structure
interface Profile {
  id: string;
  name: string;
  variables: { [key: string]: string };
  isLoggedIn?: boolean;
  isFavorite?: boolean;
  expiresIn?: number; // Milliseconds until session expires
  loginTime?: number; // Timestamp of login
  headless?: boolean; // Per-profile headless mode setting
}

interface Script {
  name: string;
  category: string;
  startUrl?: string; // Optional custom start URL
}

interface ElectronAPI {
  runTest: (data: { fileName?: string; projectName?: string; envId?: string; headless?: boolean }) => Promise<{ success: boolean; log: string }>;
  saveScript: (data: { fileName: string; content: string; category: string; startUrl?: string }) => Promise<{ success: boolean }>;
  readScript: (fileName: string) => Promise<{ success: boolean; content: string }>;
  deleteScript: (fileName: string) => Promise<{ success: boolean }>;
  getScripts: () => Promise<Script[]>;
  getEnvs: () => Promise<Profile[]>;
  saveEnvs: (envs: Profile[]) => Promise<{ success: boolean }>;
  getSessionStatus: (envId: string) => Promise<{ isLoggedIn: boolean; expiresIn: number; loginTime: number | null }>;
  logout: (envId: string) => Promise<{ success: boolean }>;
  recordScript: (data: { envId?: string; url?: string }) => Promise<{ success: boolean; content: string; error?: string }>;
  onLog: (callback: (data: string) => void) => void;
  offLog: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}


// --- Theme Definitions ---
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    background: { default: '#ffffff', paper: '#f5f5f5' },
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#90caf9' },
    background: { default: '#121212', paper: '#1e1e1e' },
    text: { primary: '#ffffff', secondary: '#b0bec5' },
  },
});

const rgbAnimation = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

export default function Dashboard() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : true; // Default to true (Dark Mode)
  });

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  const currentTheme = isDarkMode ? darkTheme : lightTheme;

  const [tabValue, setTabValue] = useState(0);

  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);

  // Dialog State
  const [openAddScript, setOpenAddScript] = useState(false);
  const [openLoginDialog, setOpenLoginDialog] = useState(false);
  const [openRecordDialog, setOpenRecordDialog] = useState(false); // New: Recorder Selection Dialog

  // Profile Editing State (Modal)
  const [openProfileDialog, setOpenProfileDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Loading State
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false); // New: Is Recording Active?
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [scriptStatuses, setScriptStatuses] = useState<Record<string, 'idle' | 'running' | 'success' | 'error'>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Terminal State
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const terminalEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, terminalOpen]);

  // Subscribe to logs
  useEffect(() => {
    window.electronAPI.onLog((data) => {
      // Clean ANSI codes if necessary, or just display raw
      // For multiline data, split it so we render clean lines
      const lines = data.split('\n');
      setLogs(prev => {
        // Limit log history to last 500 lines to prevent lag
        const newLogs = [...prev, ...lines].filter(l => l.trim().length > 0);
        return newLogs.slice(-500);
      });
      // Auto open terminal on new activity if it was closed? No, let user control.
    });
    return () => {
      window.electronAPI.offLog();
    };
  }, []);

  // Forms
  const defaultScriptTemplate = `import { test, expect } from '@playwright/test';

test('My Test', async ({ page }) => {
  // Use START_URL if set (from metadata), otherwise fall back to BASE_URL
  const startUrl = process.env.START_URL || process.env.BASE_URL || "/";
  await page.goto(startUrl);
  
  // Your test code here
  
});`;
  const [newScript, setNewScript] = useState({ name: '', envId: '', content: defaultScriptTemplate, startUrl: '' });
  const [editingScriptOriginalName, setEditingScriptOriginalName] = useState<string | null>(null);
  const [selectedLoginEnvId, setSelectedLoginEnvId] = useState('');

  // Initial Load
  // Initial Load (Run once)
  useEffect(() => {
    loadData();
  }, []);

  // Update session status every second for real-time countdown
  // But pause when editing scripts or login dialog to avoid resetting form state
  useEffect(() => {
    const interval = setInterval(() => {
      if (!openAddScript && !openLoginDialog) {
        fetchProfiles();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [openAddScript, openLoginDialog]);

  // Auto-select first profile when login dialog opens if no profile selected
  useEffect(() => {
    if (openLoginDialog && !selectedLoginEnvId && profiles.length > 0) {
      setSelectedLoginEnvId(profiles[0].id);
    }
  }, [openLoginDialog, profiles]);

  const loadData = async () => {
    await Promise.all([fetchProfiles(), fetchScripts()]);
  };

  const fetchScripts = async () => {
    try {
      const loadedScripts = await window.electronAPI.getScripts();
      setScripts(loadedScripts);
    } catch (error) {
      console.error("Failed to load scripts:", error);
      toast.error("Failed to load scripts");
    }
  };

  const fetchProfiles = async () => {
    try {
      let loadedProfiles = await window.electronAPI.getEnvs();
      const profilesWithStatus = await Promise.all(loadedProfiles.map(async (p) => {
        const status = await window.electronAPI.getSessionStatus(p.id);
        return { ...p, isLoggedIn: status.isLoggedIn, expiresIn: status.expiresIn, loginTime: status.loginTime };
      }));
      setProfiles(profilesWithStatus);

      if (profilesWithStatus.length > 0 && !newScript.envId) {
        setNewScript(prev => ({ ...prev, envId: profilesWithStatus[0].id }));
        setSelectedLoginEnvId(profilesWithStatus[0].id);
      }
    } catch (error) {
      console.error("Failed to load profiles:", error);
      toast.error("Failed to load profiles");
    }
  };

  // --- Run Scripts ---
  const handleRunScript = async (script: Script) => {
    const profile = profiles.find(p => p.id === script.category);

    // Set status to running for this specific script
    setScriptStatuses(prev => ({ ...prev, [script.name]: 'running' }));

    try {
      console.log(`Running ${script.name} with Profile: ${profile?.name}`);
      const result = await window.electronAPI.runTest({
        fileName: script.name,
        projectName: 'ba-tests',
        envId: script.category,
        headless: profile?.headless || false // Use per-profile headless setting
      });

      if (!result.success && result.log === "MISSING_SESSION_ERROR") {
        setScriptStatuses(prev => ({ ...prev, [script.name]: 'error' }));
        toast.error(`Authentication Missing for profile "${profile?.name || 'Unknown'}"!`, {
          description: "You must Login first before running scripts.",
          action: {
            label: 'Login Now',
            onClick: () => {
              if (profile) setSelectedLoginEnvId(profile.id || '');
              setOpenLoginDialog(true);
            }
          }
        });
      } else if (!result.success && result.log === "SESSION_EXPIRED_ERROR") {
        setScriptStatuses(prev => ({ ...prev, [script.name]: 'error' }));
        toast.error(`Session Expired for profile "${profile?.name || 'Unknown'}"!`, {
          description: "Your session has expired (> 5 minutes). Please login again.",
          action: {
            label: 'Login Now',
            onClick: () => {
              if (profile) setSelectedLoginEnvId(profile.id || '');
              setOpenLoginDialog(true);
            }
          }
        });
      } else {
        if (result.success) {
          setScriptStatuses(prev => ({ ...prev, [script.name]: 'success' }));
          toast.success(`"${script.name}" Finished!`, {
            description: "Execution completed successfully."
          });
        } else {
          setScriptStatuses(prev => ({ ...prev, [script.name]: 'error' }));
          toast.error(`"${script.name}" Failed`, {
            description: result.log,
            duration: 5000
          });
        }
      }
    } catch (error: any) {
      setScriptStatuses(prev => ({ ...prev, [script.name]: 'error' }));
      toast.error(`Error running script: ${error.message || error}`);
    }
  };

  // --- Session Management ---
  const handleLogin = async (envId?: string) => {
    const targetEnvId = envId || selectedLoginEnvId;
    setOpenLoginDialog(false);
    setLoginLoading(true);
    setActiveProfileId(targetEnvId);

    try {
      // Auto-save profiles before login
      const profilesToSave = profiles.map(({ isLoggedIn, ...rest }) => rest);
      await window.electronAPI.saveEnvs(profilesToSave);

      const result = await window.electronAPI.runTest({
        projectName: 'setup',
        envId: targetEnvId
      });

      if (result.success) {
        await fetchProfiles();
        toast.success("Login Successful!", { description: "Session saved successfully." });
      } else {
        toast.error("Login Failed", { description: result.log });
      }
    } catch (error: any) {
      toast.error(`Error logging in: ${error.message || error}`);
    } finally {
      setLoginLoading(false);
      setActiveProfileId(null);
    }
  };

  const handleLogout = async (envId: string) => {
    if (!confirm("Are you sure you want to logout? (Session file will be deleted)")) return;
    try {
      await window.electronAPI.logout(envId);
      await fetchProfiles();
      toast.info("Logged out successfully");
    } catch (err: any) {
      toast.error("Logout failed: " + (err.message || err));
    }
  };

  // --- Script Management ---
  const handleDeleteScript = async (fileName: string) => {
    if (!confirm(`Delete script "${fileName}"? This cannot be undone.`)) return;
    try {
      await window.electronAPI.deleteScript(fileName);
      await fetchScripts();
      toast.success(`Deleted script "${fileName}"`);
    } catch (err: any) {
      toast.error("Delete failed: " + (err.message || err));
    }
  };

  const handleEditScript = async (script: Script) => {
    try {
      const result = await window.electronAPI.readScript(script.name);
      if (result.success) {
        const cleanName = script.name.replace('.spec.ts', '');
        setNewScript({
          name: cleanName,
          envId: script.category,
          content: result.content,
          startUrl: script.startUrl || '' // Load existing start URL
        });
        setEditingScriptOriginalName(script.name);
        setOpenAddScript(true);
      } else {
        toast.error("Failed to read script content");
      }
    } catch (err: any) {
      toast.error("Error reading script: " + err.message);
    }
  };

  const handleSaveNewScript = async () => {
    if (!newScript.name || !newScript.content || !newScript.envId) {
      toast.warning("Please fill in all fields");
      return;
    }
    try {
      if (editingScriptOriginalName) {
        const newFullName = `${newScript.name}.spec.ts`;
        if (newFullName !== editingScriptOriginalName) {
          console.log(`Renaming script: deleting ${editingScriptOriginalName}`);
          await window.electronAPI.deleteScript(editingScriptOriginalName);
        }
      }

      await window.electronAPI.saveScript({
        fileName: newScript.name,
        category: newScript.envId,
        content: newScript.content,
        startUrl: newScript.startUrl // Pass start URL to backend
      });
      setOpenAddScript(false);

      // Reset with valid envId
      resetScriptForm();
      await fetchScripts();
      toast.success("Script saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || error));
    }
  };

  const resetScriptForm = () => {
    const validEnvId = profiles.length > 0 ? profiles[0].id : '';
    setNewScript({ name: '', envId: validEnvId, content: defaultScriptTemplate, startUrl: '' });
    setEditingScriptOriginalName(null);
  };

  const handleOpenAddScriptDialog = () => {
    resetScriptForm();
    setOpenAddScript(true);
  };

  const handleCloseScriptDialog = () => {
    setOpenAddScript(false);
    resetScriptForm();
  };

  // --- Magic Recorder Logic ---
  const [recordTargetEnvId, setRecordTargetEnvId] = useState('');
  const [recordStartUrl, setRecordStartUrl] = useState('');

  const handleOpenRecordDialog = () => {
    if (profiles.length > 0) {
      setRecordTargetEnvId(profiles[0].id);
      setRecordStartUrl(profiles[0].variables['BASE_URL'] || '');
    }
    setOpenRecordDialog(true);
  };

  const handleStartRecording = async () => {
    setOpenRecordDialog(false);
    setIsRecording(true);
    toast.info("Launching Recorder...", { description: "Playwright Inspector will open. Perform your actions, then close the browser to save." });

    try {
      const result = await window.electronAPI.recordScript({
        envId: recordTargetEnvId,
        url: recordStartUrl
      });

      if (result.success) {
        // Open Add Dialog with generated code
        setNewScript({
          name: `recorded_${Date.now()}`,
          envId: recordTargetEnvId, // Auto-assign to the profile we used
          content: result.content,
          startUrl: recordStartUrl
        });
        setOpenAddScript(true);
        toast.success("Recording Captured!", { description: "Script code generated successfully." });
      } else {
        if (result.error && !result.error.includes("No recording generated")) {
          toast.error("Recording Failed", { description: result.error });
        } else {
          toast.info("Recording Cancelled");
        }
      }
    } catch (err: any) {
      toast.error("Recorder Error: " + err.message);
    } finally {
      setIsRecording(false);
    }
  };


  // --- Profile Management (New Dialog Based) ---

  const handlePrepareAddProfile = () => {
    const id = `env_${Date.now()}`;
    setEditingProfile({ id, name: 'New Profile', variables: { 'BASE_URL': '', 'TEST_USER': '' } });
    setOpenProfileDialog(true);
  };

  const handleEditProfile = (profile: Profile) => {
    // Clone to local editing state
    setEditingProfile(JSON.parse(JSON.stringify(profile)));
    setOpenProfileDialog(true);
  };

  const handleSaveProfile = async () => {
    if (!editingProfile) return;

    // Update global list
    const existingIndex = profiles.findIndex(p => p.id === editingProfile.id);
    let newProfiles = [...profiles];
    if (existingIndex >= 0) {
      // preserve isLoggedIn state which is not in editingProfile usually
      const original = newProfiles[existingIndex];
      newProfiles[existingIndex] = { ...editingProfile, isLoggedIn: original.isLoggedIn };
    } else {
      newProfiles.push(editingProfile);
    }

    setProfiles(newProfiles);
    setOpenProfileDialog(false);

    // Persist to backend immediately
    try {
      const profilesToSave = newProfiles.map(({ isLoggedIn, ...rest }) => rest);
      await window.electronAPI.saveEnvs(profilesToSave);
      toast.success("Profile saved successfully");
    } catch (e: any) {
      toast.error("Failed to save profile: " + e.message);
      // Might want to revert state here if critical, but simplified for now
    }
  };

  const handleDeleteProfile = async () => {
    if (!editingProfile) return;
    if (!confirm('Delete this profile?')) return;

    const newProfiles = profiles.filter(p => p.id !== editingProfile.id);
    setProfiles(newProfiles);
    setOpenProfileDialog(false);

    try {
      const profilesToSave = newProfiles.map(({ isLoggedIn, ...rest }) => rest);
      await window.electronAPI.saveEnvs(profilesToSave);
      toast.success("Profile deleted");
    } catch (e: any) {
      toast.error("Failed to delete profile: " + e.message);
    }
  };

  const handleUpdateProfileVar = (key: string, value: string, oldKey?: string) => {
    if (!editingProfile) return;
    const newVars = { ...editingProfile.variables };

    if (oldKey && oldKey !== key) {
      delete newVars[oldKey];
    }
    newVars[key] = value;
    setEditingProfile({ ...editingProfile, variables: newVars });
  };

  const handleDeleteProfileVar = (key: string) => {
    if (!editingProfile) return;
    const newVars = { ...editingProfile.variables };
    delete newVars[key];
    setEditingProfile({ ...editingProfile, variables: newVars });
  };

  // --- Run Unassigned Script Logic ---
  const [runScriptTarget, setRunScriptTarget] = useState<Script | null>(null);

  const handleRunUnassigned = (script: Script) => {
    setRunScriptTarget(script);
  };

  const executeRunUnassigned = async (profileId: string) => {
    if (!runScriptTarget) return;

    // Create a temporary script object with the selected category for execution
    const scriptWithProfile = { ...runScriptTarget, category: profileId };
    setRunScriptTarget(null); // Close dialog

    await handleRunScript(scriptWithProfile);
  };

  const handleRunAllScripts = async (profileId: string) => {
    const profileScripts = scripts.filter(s => s.category === profileId);
    if (profileScripts.length === 0) return;

    if (!confirm(`Run all ${profileScripts.length} scripts for this profile in PARALLEL?`)) return;

    // Run all scripts simultaneously
    // We don't await the loop, allowing them to fire off at once
    profileScripts.forEach(script => {
      handleRunScript(script);
    });
  };

  // Sort profiles: Favorites first, then Create ID
  const sortedProfiles = [...profiles].sort((a, b) => {
    if (!!a.isFavorite !== !!b.isFavorite) {
      return a.isFavorite ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Toaster position="bottom-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'Orbitron, sans-serif' }}>
              AUTOMATION SYSTEM HUB
            </Typography>
            <IconButton onClick={toggleTheme} color="inherit">
              {isDarkMode ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Box>

          <Button
            variant="contained"
            color="secondary"
            startIcon={loginLoading && !activeProfileId ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
            onClick={() => setOpenLoginDialog(true)}
            disabled={loginLoading || loading || profiles.length === 0}
          >
            {loginLoading && !activeProfileId ? 'Logging in...' : 'Login Bot '}
          </Button>
        </Box>
        <Typography variant="h6" sx={{
          fontWeight: 'bold',
          fontFamily: 'Orbitron, sans-serif',
          background: 'linear-gradient(45deg, #FF0000, #FF7300, #FFFB00, #48FF00, #00FFD5, #002BFF, #7A00FF, #FF00C8, #FF0000)',
          backgroundSize: '400% 400%',
          animation: `${rgbAnimation} 3s ease infinite`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0px 0px 8px rgba(255, 255, 255, 0.3)', // Glow effect
          display: 'inline-block'
        }}>
          By Handsome Jom
        </Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabValue} onChange={(e, val) => setTabValue(val)}>
            <Tab icon={<PlayArrowIcon />} label="Run Scripts" />
            <Tab icon={<CodeIcon />} label="Manage Scripts" />
            <Tab icon={<SettingsIcon />} label="Environment Profiles" />
          </Tabs>
        </Box>

        {/* --- Tab 1: Run Scripts --- */}
        {tabValue === 0 && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
            <Typography variant="h6" gutterBottom>Ready to Execute</Typography>

            {sortedProfiles.map(profile => {
              const profileScripts = scripts.filter(s => s.category === profile.id);
              if (profileScripts.length === 0) return null;

              return (
                <Accordion key={profile.id} defaultExpanded={true}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {profile.isFavorite && <StarIcon color="warning" fontSize="small" />}
                      <Typography fontWeight="bold">{profile.name}</Typography>
                      <Chip label={`${profileScripts.length} Scripts`} size="small" variant="outlined" sx={{ ml: 1 }} />

                      <Button
                        variant="outlined"
                        color="secondary"
                        size="small"
                        startIcon={<PlaylistPlayIcon />}
                        sx={{ ml: 2, height: 24, fontSize: '0.75rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunAllScripts(profile.id);
                        }}
                      >
                        Run All
                      </Button>
                      {profile.isLoggedIn ? (
                        <Chip label="Ready" color="success" size="small" sx={{ ml: 1, height: 20 }} />
                      ) : (
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          startIcon={<LoginIcon sx={{ fontSize: 16 }} />}
                          sx={{ ml: 1, height: 24, fontSize: '0.75rem', textTransform: 'none' }}
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent accordion toggle
                            handleLogin(profile.id);
                          }}
                        >
                          Login Required
                        </Button>
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ mb: 2 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={profile.headless || false}
                            onChange={async (e) => {
                              // Update profile headless setting
                              const updatedProfiles = profiles.map(p =>
                                p.id === profile.id ? { ...p, headless: e.target.checked } : p
                              );
                              setProfiles(updatedProfiles);

                              // Save to backend
                              const profilesToSave = updatedProfiles.map(({ isLoggedIn, expiresIn, loginTime, ...rest }) => rest);
                              await window.electronAPI.saveEnvs(profilesToSave);
                            }}
                            size="small"
                          />
                        }
                        label="Headless Mode (no browser window)"
                      />
                    </Box>
                    <List disablePadding>
                      {profileScripts.map((script, idx) => (
                        <ListItem key={idx} divider secondaryAction={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {scriptStatuses[script.name] === 'success' && <Chip label="Done" color="success" size="small" variant="outlined" icon={<CheckCircleIcon />} />}
                            {scriptStatuses[script.name] === 'error' && <Chip label="Failed" color="error" size="small" variant="outlined" icon={<ErrorIcon />} />}

                            <Button
                              variant="contained"
                              color={scriptStatuses[script.name] === 'running' ? "secondary" : "success"}
                              size="small"
                              startIcon={scriptStatuses[script.name] === 'running' ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                              onClick={() => handleRunScript(script)}
                              disabled={scriptStatuses[script.name] === 'running' || loginLoading}
                            >
                              {scriptStatuses[script.name] === 'running' ? 'Running...' : 'Run'}
                            </Button>
                          </Box>
                        }>
                          <ListItemText primary={script.name} />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })}

            {/* Unassigned Scripts */}
            {scripts.filter(s => !profiles.find(p => p.id === s.category)).length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography color="error">Unassigned / Deleted Profiles</Typography></AccordionSummary>
                <AccordionDetails>
                  <List>
                    {scripts.filter(s => !profiles.find(p => p.id === s.category)).map((s, i) => (
                      <ListItem key={i} secondaryAction={
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          {scriptStatuses[s.name] === 'success' && <CheckCircleIcon color="success" />}
                          {scriptStatuses[s.name] === 'error' && <ErrorIcon color="error" />}
                          <Button
                            variant="contained" color="warning" size="small"
                            startIcon={scriptStatuses[s.name] === 'running' ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                            onClick={() => handleRunUnassigned(s)}
                            disabled={scriptStatuses[s.name] === 'running' || loginLoading}
                          >
                            {scriptStatuses[s.name] === 'running' ? 'Running' : 'Run'}
                          </Button>
                          <IconButton color="primary" onClick={() => handleEditScript(s)} aria-label="edit">
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" color="error" onClick={() => handleDeleteScript(s.name)} aria-label="delete">
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      }>
                        <ListItemText
                          primary={s.name}
                          secondary="No Profile Assigned - Run manually"
                          secondaryTypographyProps={{ color: 'text.secondary', variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}
          </Paper>
        )}

        {/* --- Tab 2: Manage Scripts --- */}
        {tabValue === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label="Search Scripts"
                variant="outlined"
                size="small"
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddScriptDialog} sx={{ whiteSpace: 'nowrap', px: 2 }}>
                Add Script
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={isRecording ? <CircularProgress size={20} color="inherit" /> : <FiberManualRecordIcon />}
                onClick={handleOpenRecordDialog}
                disabled={isRecording}
                sx={{ whiteSpace: 'nowrap', bgcolor: '#ff1744', '&:hover': { bgcolor: '#d50000' } }}
              >
                {isRecording ? 'Recording...' : 'Record'}
              </Button>
            </Box>
            <List>
              {scripts.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((script, index) => {
                const profile = profiles.find(p => p.id === script.category);
                return (
                  <ListItem key={index} divider secondaryAction={
                    <Box>
                      <IconButton color="primary" onClick={() => handleEditScript(script)}>
                        <EditIcon />
                      </IconButton>
                      <IconButton edge="end" color="error" onClick={() => handleDeleteScript(script.name)}>
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }>
                    <CodeIcon sx={{ mr: 2, color: 'text.secondary' }} />
                    <ListItemText
                      primary={script.name}
                      secondary={profile ? profile.name : 'Unknown Profile'}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}

        {/* --- Tab 3: Environment Profiles (GRID CARD VIEW) --- */}
        {tabValue === 2 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Environment Profiles</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handlePrepareAddProfile}>
                Create New Profile
              </Button>
            </Box>

            <Grid container spacing={3}>
              {sortedProfiles.map((profile) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={profile.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: '100%',
                      bgcolor: profile.isFavorite ? (isDarkMode ? 'rgba(255, 193, 7, 0.08)' : '#fffbf2') : 'background.paper',
                      borderColor: profile.isFavorite ? '#ffc107' : undefined,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: 3 }
                    }}
                  >
                    <CardActionArea onClick={() => handleEditProfile(profile)} sx={{ height: '100%', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', mb: 1 }}>
                        {profile.isFavorite ? <StarIcon color="warning" /> : <SettingsIcon color="action" />}
                        <Typography variant="h6" sx={{ ml: 1, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {profile.name}
                        </Typography>
                      </Box>

                      <Box sx={{ mt: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {profile.isLoggedIn ? (
                          <>
                            <Chip label="Logged In" color="success" size="small" />
                            {profile.expiresIn !== undefined && profile.expiresIn > 0 && (
                              <Chip
                                label={`${Math.floor(profile.expiresIn / 60000)}:${String(Math.floor((profile.expiresIn % 60000) / 1000)).padStart(2, '0')}`}
                                color={profile.expiresIn < 60000 ? 'error' : profile.expiresIn < 180000 ? 'warning' : 'success'}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </>
                        ) : (
                          <Chip label="Not Logged In" size="small" variant="outlined" />
                        )}
                        <Chip label={`${Object.keys(profile.variables).length} Vars`} size="small" variant="outlined" />
                      </Box>
                      <Typography variant="caption" sx={{ mt: 2, color: 'text.secondary' }}>Click to view details & edit</Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* --- DIALOG: Add/Edit Script --- */}
        <Dialog open={openAddScript} onClose={handleCloseScriptDialog} fullWidth maxWidth="md">
          <DialogTitle>{editingScriptOriginalName ? 'Edit Script' : 'Add New Test Script'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="File Name (e.g. test_01)" value={newScript.name} onChange={(e) => setNewScript({ ...newScript, name: e.target.value })} fullWidth />
              <FormControl fullWidth>
                <InputLabel>Profile (Environment)</InputLabel>
                <Select value={newScript.envId} label="Profile (Environment)" onChange={(e) => setNewScript({ ...newScript, envId: e.target.value })}>
                  {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label="Start URL (Optional)"
                value={newScript.startUrl}
                onChange={(e) => setNewScript({ ...newScript, startUrl: e.target.value })}
                fullWidth
                placeholder="e.g., https://example.com/tracking/123"
                helperText="Leave empty to use BASE_URL from profile"
              />
              <TextField label="Script Content" multiline rows={15} value={newScript.content} onChange={(e) => setNewScript({ ...newScript, content: e.target.value })} fullWidth />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseScriptDialog}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveNewScript}>Save Script</Button>
          </DialogActions>
        </Dialog>

        {/* --- DIALOG: Profile Detail / Edit --- */}
        <Dialog open={openProfileDialog} onClose={() => setOpenProfileDialog(false)} fullWidth maxWidth="md">
          {editingProfile && (
            <>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Edit Profile: {editingProfile.name}
                <Box>
                  <IconButton onClick={() => setEditingProfile({ ...editingProfile, isFavorite: !editingProfile.isFavorite })}>
                    {editingProfile.isFavorite ? <StarIcon color="warning" /> : <StarBorderIcon />}
                  </IconButton>
                  <IconButton onClick={() => setOpenProfileDialog(false)}><CloseIcon /></IconButton>
                </Box>
              </DialogTitle>
              <DialogContent dividers>
                <Stack spacing={3}>
                  {/* Header Info */}
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      label="Profile Name"
                      fullWidth
                      value={editingProfile.name}
                      onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                    />
                    {/* Actions related to session could ideally be here, but let's keep them simple for now */}
                  </Box>

                  <Divider textAlign="left">CREDENTIALS</Divider>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <TextField
                      label="Base URL"
                      value={editingProfile.variables['BASE_URL'] || ''}
                      onChange={(e) => handleUpdateProfileVar('BASE_URL', e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Username"
                      value={editingProfile.variables['TEST_USER'] || ''}
                      onChange={(e) => handleUpdateProfileVar('TEST_USER', e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={editingProfile.variables['TEST_PASS'] || ''}
                      onChange={(e) => handleUpdateProfileVar('TEST_PASS', e.target.value)}
                      fullWidth
                    />
                  </Box>



                  <Divider />

                  {/* Danger Zone */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#fff5f5', p: 2, borderRadius: 1 }}>
                    <Typography variant="body2" color="error">Danger Zone</Typography>
                    <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={handleDeleteProfile}>
                      Delete Profile
                    </Button>
                  </Box>
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setOpenProfileDialog(false)}>Cancel</Button>
                <Button variant="contained" onClick={handleSaveProfile} startIcon={<SaveIcon />}>Save Changes</Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* --- DIALOG: Login Selection --- */}
        <Dialog open={openLoginDialog} onClose={() => setOpenLoginDialog(false)}>
          <DialogTitle>Select Environment to Login</DialogTitle>
          <DialogContent sx={{ minWidth: 300, pt: 1 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Which environment profile do you want to authenticate with?
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {profiles.length} profile(s) available
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Profile</InputLabel>
              <Select value={selectedLoginEnvId} label="Profile" onChange={(e) => setSelectedLoginEnvId(e.target.value)}>
                {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenLoginDialog(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => handleLogin()} autoFocus>Start Login Bot</Button>
          </DialogActions>
        </Dialog>

        {/* --- DIALOG: Run Unassigned Script (Select Profile) --- */}
        <Dialog open={!!runScriptTarget} onClose={() => setRunScriptTarget(null)}>
          <DialogTitle>Run Script: {runScriptTarget?.name}</DialogTitle>
          <DialogContent sx={{ minWidth: 300, pt: 1 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This script is not assigned to any profile. Please select an environment profile to run it with.
            </Alert>
            <FormControl fullWidth>
              <InputLabel>Run with Profile</InputLabel>
              <Select
                defaultValue=""
                label="Run with Profile"
                onChange={(e) => executeRunUnassigned(e.target.value)}
              >
                {profiles.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRunScriptTarget(null)}>Cancel</Button>
          </DialogActions>
        </Dialog>

        {/* --- DIALOG: Magic Recorder Setup --- */}
        <Dialog open={openRecordDialog} onClose={() => setOpenRecordDialog(false)}>
          <DialogTitle>🔴 Magic Recorder Setup</DialogTitle>
          <DialogContent sx={{ minWidth: 350, pt: 1 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This will launch a new browser window. Actions you perform will be recorded automatically.
            </Typography>

            <Stack spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Record As Profile (Optional)</InputLabel>
                <Select
                  value={recordTargetEnvId}
                  label="Record As Profile (Optional)"
                  onChange={(e) => {
                    const id = e.target.value;
                    setRecordTargetEnvId(id);
                    const p = profiles.find(p => p.id === id);
                    if (p && p.variables['BASE_URL']) setRecordStartUrl(p.variables['BASE_URL']);
                  }}
                >
                  <MenuItem value=""><em>None (Clean Session)</em></MenuItem>
                  {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>

              <TextField
                label="Start URL"
                size="small"
                fullWidth
                value={recordStartUrl}
                onChange={(e) => setRecordStartUrl(e.target.value)}
                placeholder="https://example.com"
                helperText="Optional: The browser will open directly to this URL."
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenRecordDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<FiberManualRecordIcon />}
              onClick={handleStartRecording}
            >
              Start Recording
            </Button>
          </DialogActions>
        </Dialog>

        {/* Loading Backdrop for Headless Login */}
        <Backdrop
          sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, flexDirection: 'column', gap: 2 }}
          open={loginLoading}
        >
          <CircularProgress color="inherit" size={60} />
          <Typography variant="h6">Logging in...</Typography>
          <Typography variant="body2">Please wait while we authenticate</Typography>
        </Backdrop>

        {/* --- LIVE TERMINAL DRAWER --- */}
        <Paper
          elevation={10}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: terminalOpen ? 300 : 40,
            transition: 'height 0.3s ease',
            bgcolor: '#1e1e1e',
            color: '#33ff00',
            fontFamily: 'monospace',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            borderTop: '2px solid #333'
          }}
        >
          {/* Terminal Header */}
          <Box
            onClick={() => setTerminalOpen(!terminalOpen)}
            sx={{
              p: 1,
              px: 2,
              cursor: 'pointer',
              bgcolor: '#252526',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              '&:hover': { bgcolor: '#2d2d2d' }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>LIVE TERMINAL</Typography>
              {logs.length > 0 && <Chip label={`${logs.length} lines`} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#333', color: '#fff' }} />}
            </Box>
            {terminalOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
          </Box>

          {/* Terminal Content */}
          {terminalOpen && (
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, fontSize: '0.85rem' }}>
              {logs.length === 0 ? (
                <Typography variant="caption" sx={{ color: '#666' }}>Waiting for logs...</Typography>
              ) : (
                logs.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: '2px' }}>
                    <span style={{ color: '#555', marginRight: '8px', userSelect: 'none' }}>[{i + 1}]</span>
                    {line}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </Box>
          )}
        </Paper>

      </Container>
    </ThemeProvider>
  );
}
import { createRoot } from 'react-dom/client';


const rootElement = document.getElementById('root');
const root = createRoot(rootElement!);
root.render(<Dashboard />);