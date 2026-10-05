import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import { useWearwell, WardrobeItem } from '@/context/WearwellContext';
import {
  ActionButton,
  BrandHeader,
  Card,
  ChoiceChip,
  Eyebrow,
  InlineNotice,
  PageTitle,
  ScreenScroll,
  SectionTitle,
  TextField,
} from '@/components/WearwellUI';
// @ts-ignore Shared wardrobe-photo helpers are plain JavaScript modules.
import {
  applyWardrobeVisionSuggestion,
  validateWardrobePhotoFile,
} from '../../../../src/wardrobeCapture.mjs';
// @ts-ignore Shared normalization helper is plain JavaScript.
import { normalizeWardrobeVisionResult } from '../../../../supabase/functions/_shared/wardrobe-vision.js';

const CATEGORIES = ['Top', 'Bottom', 'Dress', 'Layer', 'Shoes', 'Accessory'];
const COLOR_SWATCHES = [
  { name: 'Ink', color: '#26324b' },
  { name: 'Black', color: '#282826' },
  { name: 'Cream', color: '#e5dbc9' },
  { name: 'White', color: '#f3f0e8' },
  { name: 'Seafoam', color: '#b7d8cf' },
  { name: 'Sage', color: '#8d9a77' },
  { name: 'Terracotta', color: '#bd725b' },
  { name: 'Plum', color: '#5f354f' },
  { name: 'Denim', color: '#6d819b' },
];
const WEATHER_TAGS = [
  { label: 'Not set', value: '' },
  { label: 'All season', value: 'all' },
  { label: 'Warm weather', value: 'hot' },
  { label: 'Cool weather', value: 'cool' },
];

type Draft = {
  name: string;
  type: string;
  tone: string;
  color: string;
  formality: number | null;
  weather: string;
  comfort: string;
  fitNote: string;
  note: string;
  visualAttributes?: Record<string, any>;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  type: 'Top',
  tone: 'Ink',
  color: '#26324b',
  formality: null,
  weather: 'all',
  comfort: '',
  fitNote: '',
  note: '',
  visualAttributes: {},
};

function formalityName(value: number | null | undefined) {
  if (value === 1) return 'Everyday';
  if (value === 2) return 'Smart';
  if (value === 3) return 'Formal';
  return 'Not set';
}

export default function WardrobeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const { state, saveWardrobeItem, removeWardrobeItem, setAvailability } = useWearwell();
  const [, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoSuggestion, setPhotoSuggestion] = useState<any>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouchedFields((current) => new Set(current).add(key));
  }

  function startNewItem() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSuggestion(null);
    setSuggestionsApplied(false);
    setTouchedFields(new Set());
    setError('');
    setNotice('');
    setPermissionNeedsSettings(false);
    setFormOpen(true);
  }

  function startEditing(item: WardrobeItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      type: item.type,
      tone: item.tone || 'Ink',
      color: item.color,
      formality: typeof item.formality === 'number' && item.formalityExplicit ? item.formality : null,
      weather: item.weather || '',
      comfort: item.comfort || '',
      fitNote: item.fitNote || '',
      note: item.note || '',
      visualAttributes: item.visualAttributes || {},
    });
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSuggestion(null);
    setSuggestionsApplied(false);
    setTouchedFields(new Set());
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  async function choosePhoto(source: 'camera' | 'library') {
    setPermissionNeedsSettings(false);
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const permission =
          source === 'camera'
            ? await requestCameraPermission()
            : await requestLibraryPermission();
        if (!permission.granted) {
          setPermissionNeedsSettings(!permission.canAskAgain);
          setError(
            source === 'camera'
              ? 'Camera access is needed only to take a photo of this wardrobe item. You can also continue without a photo.'
              : 'Photo access is needed only to choose an item reference. You can also continue without a photo.',
          );
          return;
        }
      }

      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3] as [number, number],
        quality: 0.72,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = !result.canceled ? result.assets[0] : null;
      if (asset?.uri) {
        const extensionType = asset.uri.toLowerCase().endsWith('.png')
          ? 'image/png'
          : asset.uri.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        const mimeType = asset.mimeType || extensionType;
        const validationError = validateWardrobePhotoFile({
          type: mimeType,
          size: Number(asset.fileSize),
        });
        if (validationError) {
          setError(validationError);
          return;
        }
        setPhotoAsset(asset);
        setPhotoUri(asset.uri);
        setPhotoSuggestion(null);
        setSuggestionsApplied(false);
        setNotice('Photo selected for this edit. It will not be saved with the wardrobe item.');
      }
    } catch {
      setError('The photo could not be opened. You can still add the item without one.');
    }
  }

  async function analyzePhoto() {
    if (!photoAsset) return;
    if (!session?.user) {
      setError('Sign in to analyze a wardrobe photo. You can still enter the item details manually.');
      return;
    }
    if (!state.settings.aiEnabled || !supabase) {
      setError('Turn on AI assistance in Settings before analyzing a photo.');
      return;
    }

    setPhotoBusy(true);
    setError('');
    setPhotoSuggestion(null);
    setSuggestionsApplied(false);
    try {
      let prepared = await ImageManipulator.manipulateAsync(
        photoAsset.uri,
        [{ resize: { width: 1400 } }],
        {
          compress: 0.76,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (prepared.base64 && prepared.base64.length * 0.75 > 1_350_000) {
        prepared = await ImageManipulator.manipulateAsync(
          photoAsset.uri,
          [{ resize: { width: 900 } }],
          {
            compress: 0.48,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
      }
      if (!prepared.base64 || prepared.base64.length * 0.75 > 1_350_000) {
        throw new Error('The compressed photo is still too large. Choose a smaller image.');
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        'analyze-wardrobe-photo',
        {
          body: { mimeType: 'image/jpeg', imageBase64: prepared.base64 },
        },
      );
      if (invokeError) throw invokeError;
      const suggestion = normalizeWardrobeVisionResult(data?.result);
      if (!suggestion) throw new Error('The photo analysis response could not be validated.');
      setPhotoSuggestion(suggestion);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : 'Photo analysis could not finish. Try another photo or enter the details manually.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  function applyPhotoSuggestions() {
    if (!photoSuggestion || suggestionsApplied) return;
    setDraft((current) =>
      applyWardrobeVisionSuggestion(current, photoSuggestion, Array.from(touchedFields)),
    );
    setSuggestionsApplied(true);
  }

  function openSystemSettings() {
    Linking.openSettings().catch(() => {
      setError('Open your device settings and allow photo access for Wearwell.');
    });
  }

  function saveItem() {
    const name = draft.name.trim();
    if (!name) {
      setError('Add a name for this item before saving.');
      return;
    }
    const existingItem = state.wardrobe.find((item) => item.id === editingId);
    const item: WardrobeItem = {
      id: existingItem?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...(existingItem?._cloudId ? { _cloudId: existingItem._cloudId } : {}),
      name,
      type: draft.type,
      tone: draft.tone,
      color: draft.color,
      icon: existingItem?.icon || (draft.type === 'Shoes' ? '⌁' : draft.type === 'Layer' ? '▱' : '✦'),
      formality: draft.formality ?? undefined,
      formalityExplicit: draft.formality !== null,
      weather: draft.weather,
      comfort: draft.comfort.trim(),
      fitNote: draft.fitNote.trim(),
      note: draft.note.trim(),
      visualAttributes: draft.visualAttributes || existingItem?.visualAttributes || {},
      available: editingId
        ? state.wardrobe.find((item) => item.id === editingId)?.available !== false
        : true,
    };
    saveWardrobeItem(item);
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSuggestion(null);
    setSuggestionsApplied(false);
    setTouchedFields(new Set());
    setFormOpen(false);
    setNotice(editingId ? 'Wardrobe item updated.' : 'Wardrobe item saved on this device.');
    setEditingId(null);
  }

  function confirmRemove(item: WardrobeItem) {
    Alert.alert('Remove this item?', `${item.name} will be removed from your saved wardrobe.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeWardrobeItem(item.id),
      },
    ]);
  }

  const availableCount = state.wardrobe.filter((item) => item.available !== false).length;

  return (
    <ScreenScroll>
      <BrandHeader caption="YOUR CLOTHES, YOUR RULES" />
      <PageTitle
        title="Your wardrobe"
        subtitle={`${state.wardrobe.length} ${state.wardrobe.length === 1 ? 'piece' : 'pieces'} saved · ${availableCount} available to wear`}
      />

      <Card style={{ gap: 12, backgroundColor: colors.warm, borderColor: colors.warm }}>
        <SectionTitle
          title="Build from what you own"
          detail="Recommendations use only the pieces you add. Unknown details are left unknown."
        />
        <ActionButton
          label={formOpen ? 'Close item form' : 'Add a wardrobe item'}
          icon={formOpen ? 'x' : 'plus'}
          onPress={() => (formOpen ? setFormOpen(false) : startNewItem())}
        />
      </Card>

      {notice && !formOpen ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      {formOpen ? (
        <Card style={{ gap: 15 }}>
          <SectionTitle
            title={editingId ? 'Edit item details' : 'Add an item'}
            detail="Only the details you confirm are saved."
          />
          <TextField
            label="Item name"
            value={draft.name}
            onChangeText={(value) => updateDraft('name', value)}
            placeholder="e.g. Linen shirt"
            maxLength={120}
            returnKeyType="next"
          />

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map((category) => (
                <ChoiceChip
                  key={category}
                  label={category}
                  selected={draft.type === category}
                  onPress={() => updateDraft('type', category)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Main colour
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {COLOR_SWATCHES.map((swatch) => {
                const selected = draft.color === swatch.color;
                return (
                  <View key={swatch.name} style={{ alignItems: 'center', gap: 5 }}>
                    <Pressable
                      onPress={() => {
                        updateDraft('tone', swatch.name);
                        updateDraft('color', swatch.color);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${swatch.name} colour`}
                      style={{
                        width: 34,
                        height: 34,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 17,
                        borderWidth: selected ? 3 : 1,
                        borderColor: selected ? colors.plum : colors.border,
                        backgroundColor: swatch.color,
                      }}
                    >
                      {selected ? <Feather name="check" size={14} color={swatch.name === 'White' || swatch.name === 'Cream' ? colors.ink : '#ffffff'} /> : null}
                    </Pressable>
                    <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>{swatch.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Formality <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>· optional</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {[null, 1, 2, 3].map((value) => (
                <ChoiceChip
                  key={value ?? 'unknown'}
                  label={formalityName(value)}
                  selected={draft.formality === value}
                  onPress={() => updateDraft('formality', value)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Weather note <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>· optional</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {WEATHER_TAGS.map((tag) => (
                <ChoiceChip
                  key={tag.value || 'unset'}
                  label={tag.label}
                  selected={draft.weather === tag.value}
                  onPress={() => updateDraft('weather', tag.value)}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Comfort notes"
            value={draft.comfort}
            onChangeText={(value) => updateDraft('comfort', value)}
            placeholder="Only details you know, e.g. soft, breathable"
            maxLength={160}
          />
          <TextField
            label="Movement or fit notes"
            value={draft.fitNote}
            onChangeText={(value) => updateDraft('fitNote', value)}
            placeholder="e.g. easy to move in"
            maxLength={160}
          />
          <TextField
            label="Other notes"
            value={draft.note}
            onChangeText={(value) => updateDraft('note', value)}
            placeholder="Anything else you want Wearwell to remember"
            maxLength={300}
          />

          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Photo reference <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>· optional</Text>
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
              A selected photo is temporary. Wearwell does not save it with your item.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ActionButton
                compact
                variant="outline"
                label="Choose photo"
                icon="image"
                onPress={() => void choosePhoto('library')}
              />
              {Platform.OS !== 'web' ? (
                <ActionButton
                  compact
                  variant="outline"
                  label="Take photo"
                  icon="camera"
                  onPress={() => void choosePhoto('camera')}
                />
              ) : null}
            </View>
            {photoUri ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 2 }}>
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.muted }}
                  accessibilityLabel="Temporary wardrobe photo preview"
                />
                <ActionButton
                  compact
                  variant="quiet"
                  label="Remove photo"
                  icon="x"
                  onPress={() => {
                    setPhotoUri(null);
                    setPhotoAsset(null);
                    setPhotoSuggestion(null);
                    setSuggestionsApplied(false);
                  }}
                />
              </View>
            ) : null}
            {photoUri && !session?.user ? (
              <ActionButton
                compact
                variant="outline"
                label="Sign in to analyze this photo"
                icon="log-in"
                onPress={() => router.push('/account')}
              />
            ) : null}
            {photoUri && session?.user ? (
              <ActionButton
                compact
                variant="outline"
                label={photoBusy ? 'Analyzing…' : 'Analyze photo for item details'}
                icon={photoBusy ? 'clock' : 'search'}
                disabled={photoBusy || !state.settings.aiEnabled}
                onPress={() => void analyzePhoto()}
              />
            ) : null}
            {photoSuggestion ? (
              <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.background }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  Review the suggestions
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                  {photoSuggestion.suggestedName || 'Item name not identified'} · {photoSuggestion.category} · {photoSuggestion.colorName || 'color uncertain'} · {photoSuggestion.pattern}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17 }}>
                  Confidence: {photoSuggestion.confidence}. Check the fields and edit anything before saving.
                </Text>
                <ActionButton
                  compact
                  label={suggestionsApplied ? 'Suggestions added to the form' : 'Use reviewed suggestions'}
                  icon={suggestionsApplied ? 'check' : 'edit-3'}
                  disabled={suggestionsApplied}
                  onPress={applyPhotoSuggestions}
                />
              </View>
            ) : null}
            {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
            {notice && formOpen ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
            {permissionNeedsSettings ? (
              <ActionButton
                compact
                variant="quiet"
                label="Open device settings"
                icon="settings"
                onPress={openSystemSettings}
              />
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 9 }}>
            <ActionButton
              style={{ flex: 1 }}
              label={editingId ? 'Save changes' : 'Save item'}
              icon="check"
              onPress={saveItem}
            />
            <ActionButton
              variant="outline"
              label="Cancel"
              onPress={() => {
                setPhotoUri(null);
                setFormOpen(false);
                setError('');
              }}
            />
          </View>
        </Card>
      ) : null}

      {state.wardrobe.length === 0 ? (
        <Card style={{ gap: 9, alignItems: 'center', paddingVertical: 25 }}>
          <Feather name="sun" size={25} color={colors.plum} />
          <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 22 }}>
            Nothing saved yet
          </Text>
          <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
            Start with pieces you wear often. You can leave comfort, formality, and weather details blank.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Saved pieces" />
          {state.wardrobe.map((item) => (
            <Card key={item.id} style={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 13,
                    backgroundColor: item.color,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: '#ffffffcc', fontSize: 20 }}>{item.icon || '✦'}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                    {item.type} · {item.tone || 'Colour not set'}
                  </Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 17 }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                    {formalityName(item.formalityExplicit ? item.formality : null)}
                    {item.available === false ? ' · unavailable' : ''}
                  </Text>
                </View>
              </View>
              {item.comfort || item.fitNote || item.note ? (
                <Text style={{ marginTop: 9, color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                  {[item.comfort, item.fitNote, item.note].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                <ActionButton
                  compact
                  variant="quiet"
                  label="Edit"
                  icon="edit-2"
                  onPress={() => startEditing(item)}
                />
                <ActionButton
                  compact
                  variant="outline"
                  label={item.available === false ? 'Mark available' : 'Mark unavailable'}
                  icon={item.available === false ? 'check' : 'slash'}
                  onPress={() => setAvailability(item.id, item.available === false)}
                />
                <ActionButton
                  compact
                  variant="quiet"
                  label="Remove"
                  icon="trash-2"
                  onPress={() => confirmRemove(item)}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Feather name="shield" size={14} color={colors.mutedForeground} />
        <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
          Wardrobe details stay on this device. Photos are never stored with items.
        </Text>
      </View>
    </ScreenScroll>
  );
}