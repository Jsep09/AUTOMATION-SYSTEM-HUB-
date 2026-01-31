import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Tabs, Tab, Paper, Button, 
  TextField, Select, MenuItem, InputLabel, FormControl,
  List, ListItem, ListItemText, IconButton, Chip, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  CircularProgress, Card, CardContent, Divider, Grid, CardActionArea
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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
import { Toaster, toast } from 'sonner';

// Interface matching the new backend structure
interface Profile {
  id: string;
  name: string;
  variables: { [key: string]: string };
  isLoggedIn?: boolean; 
  isFavorite?: boolean; 
}

interface Script {
  name: string;
  category: string; 
}

interface ElectronAPI {
  runTest: (data: { fileName?: string; projectName?: string; envId?: string }) => Promise<{ success: boolean; log: string }>;
  saveScript: (data: { fileName: string; content: string; category: string }) => Promise<{ success: boolean }>;
  readScript: (fileName: string) => Promise<{ success: boolean; content: string }>; 
  deleteScript: (fileName: string) => Promise<{ success: boolean }>; 
  getScripts: () => Promise<Script[]>;
  getEnvs: () => Promise<Profile[]>;
  saveEnvs: (envs: Profile[]) => Promise<{ success: boolean }>;
  getSessionStatus: (envId: string) => Promise<{ isLoggedIn: boolean }>;
  logout: (envId: string) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export default function Dashboard() {
  const [tabValue, setTabValue] = useState(0);
  
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  
  // Dialog State
  const [openAddScript, setOpenAddScript] = useState(false);
  const [openLoginDialog, setOpenLoginDialog] = useState(false);
  
  // Profile Editing State (Modal)
  const [openProfileDialog, setOpenProfileDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Loading State
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false); 
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null); 
  
  // Forms
  const [newScript, setNewScript] = useState({ name: '', envId: '', content: '' });
  const [editingScriptOriginalName, setEditingScriptOriginalName] = useState<string | null>(null); 
  const [selectedLoginEnvId, setSelectedLoginEnvId] = useState('');

  // Initial Load
  useEffect(() => {
    loadData();
  }, []);

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
         return { ...p, isLoggedIn: status.isLoggedIn };
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
    setLoading(true);
    try {
      console.log(`Running ${script.name} with Profile: ${profile?.name}`);
      const result = await window.electronAPI.runTest({
        fileName: script.name,
        projectName: 'ba-tests',
        envId: script.category 
      });

      if (!result.success && result.log === "MISSING_SESSION_ERROR") {
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
      } else {
         if (result.success) {
            toast.success("Execution Finished Successfully!", { 
              description: "Script execution completed without errors."
            });
         } else {
            toast.error("Execution Failed", { 
              description: result.log,
              duration: 5000 
            });
         }
      }
    } catch (error: any) {
      toast.error(`Error running script: ${error.message || error}`);
    } finally {
      setLoading(false);
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
    if(!confirm("Are you sure you want to logout? (Session file will be deleted)")) return;
    try {
      await window.electronAPI.logout(envId);
      await fetchProfiles(); 
      toast.info("Logged out successfully");
    } catch(err: any) {
      toast.error("Logout failed: " + (err.message || err));
    }
  };

  // --- Script Management ---
  const handleDeleteScript = async (fileName: string) => {
    if(!confirm(`Delete script "${fileName}"? This cannot be undone.`)) return;
    try {
      await window.electronAPI.deleteScript(fileName);
      await fetchScripts();
      toast.success(`Deleted script "${fileName}"`);
    } catch(err: any) {
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
            content: result.content
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
        content: newScript.content
      });
      setOpenAddScript(false);
      setNewScript({ name: '', envId: profiles[0]?.id || '', content: '' });
      setEditingScriptOriginalName(null); 
      await fetchScripts(); 
      toast.success("Script saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || error));
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
    if(!confirm('Delete this profile?')) return;

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
  
  // Sort profiles: Favorites first, then Create ID
  const sortedProfiles = [...profiles].sort((a, b) => {
    if (!!a.isFavorite !== !!b.isFavorite) {
        return a.isFavorite ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Toaster position="bottom-right" richColors />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'Orbitron, sans-serif' }}>
          AUTOMATION SYSTEM HUB 
        </Typography>
     
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
       <Typography variant="h6" sx={{ fontWeight: 'bold', fontFamily: 'Orbitron, sans-serif' }}>
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
        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
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
                       {profile.isLoggedIn ? (
                          <Chip label="Ready" color="success" size="small" sx={{ ml: 1, height: 20 }} />
                       ) : (
                          <Chip label="Login Req" color="error" size="small" sx={{ ml: 1, height: 20 }} />
                       )}
                    </Box>
                 </AccordionSummary>
                 <AccordionDetails>
                    <List disablePadding>
                      {profileScripts.map((script, idx) => (
                        <ListItem key={idx} divider secondaryAction={
                          <Button 
                             variant="contained" color="success" size="small" startIcon={<PlayArrowIcon />}
                             onClick={() => handleRunScript(script)} disabled={loading || loginLoading}
                           >
                             Run
                           </Button>
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
                        <ListItem key={i}><ListItemText primary={s.name} /></ListItem>
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenAddScript(true)}>Add New Script</Button>
          <List sx={{ mt: 2 }}>
             {scripts.map((script, index) => {
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
                    bgcolor: profile.isFavorite ? '#fffbf2' : 'white', 
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
                      
                      <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
                          {profile.isLoggedIn ? (
                             <Chip label="Loged In" color="success" size="small" />
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
      <Dialog open={openAddScript} onClose={() => setOpenAddScript(false)} fullWidth maxWidth="md">
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
            <TextField label="Script Content" multiline rows={15} value={newScript.content} onChange={(e) => setNewScript({ ...newScript, content: e.target.value })} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddScript(false)}>Cancel</Button>
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

                    <Divider textAlign="left">CUSTOM VARIABLES</Divider>
                    
                    {Object.entries(editingProfile.variables)
                      .filter(([key]) => !['BASE_URL', 'TEST_USER', 'TEST_PASS'].includes(key)) 
                      .map(([key, val], vIndex) => (
                      <Box key={vIndex} sx={{ display: 'flex', gap: 2 }}>
                        <TextField 
                          label="Key" size="small" value={key} 
                          onChange={(e) => handleUpdateProfileVar(e.target.value, val, key)} 
                        />
                        <TextField 
                           label="Value" size="small" fullWidth value={val} 
                           onChange={(e) => handleUpdateProfileVar(key, e.target.value)} 
                        />
                        <IconButton size="small" onClick={() => handleDeleteProfileVar(key)}><DeleteIcon /></IconButton>
                      </Box>
                    ))}
                    <Button startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} 
                      onClick={() => handleUpdateProfileVar('NEW_VAR', '')}
                    >Add Custom Variable</Button>

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
    </Container>
  );
}
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement!);
root.render(<Dashboard />);