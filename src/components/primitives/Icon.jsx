import {
  LayoutDashboard, ListTodo, Mic, BarChart3, Settings, Briefcase, User, HeartPulse,
  ShoppingCart, Home, Wallet, GraduationCap, Users, Car, FileText, CalendarClock,
  Gamepad2, Sparkles, Search, Plus, Check, X, Trash2, Pin, PinOff, Pencil, Calendar,
  Clock, Tag, Repeat, ChevronRight, ChevronDown, ChevronLeft, ChevronUp, AlertTriangle,
  Info, CheckCircle2, XCircle, Volume2, VolumeX, Command, Keyboard, Sun, Moon,
  Contrast, Download, Upload, Undo2, Play, Square, Filter, ArrowUpDown, Flame,
  Timer, CircleDot, Inbox, CalendarDays, MessageSquare, Wand2, Loader2, Star,
  PanelLeftClose, PanelLeft, HelpCircle, Zap, Target, TrendingUp, BellRing, Radio,
  Languages, Gauge, RotateCcw, Copy, ExternalLink, MicOff, ListChecks, CircleSlash,
} from 'lucide-react'

const MAP = {
  LayoutDashboard, ListTodo, Mic, BarChart3, Settings, Briefcase, User, HeartPulse,
  ShoppingCart, Home, Wallet, GraduationCap, Users, Car, FileText, CalendarClock,
  Gamepad2, Sparkles, Search, Plus, Check, X, Trash2, Pin, PinOff, Pencil, Calendar,
  Clock, Tag, Repeat, ChevronRight, ChevronDown, ChevronLeft, ChevronUp, AlertTriangle,
  Info, CheckCircle2, XCircle, Volume2, VolumeX, Command, Keyboard, Sun, Moon,
  Contrast, Download, Upload, Undo2, Play, Square, Filter, ArrowUpDown, Flame,
  Timer, CircleDot, Inbox, CalendarDays, MessageSquare, Wand2, Loader2, Star,
  PanelLeftClose, PanelLeft, HelpCircle, Zap, Target, TrendingUp, BellRing, Radio,
  Languages, Gauge, RotateCcw, Copy, ExternalLink, MicOff, ListChecks, CircleSlash,
}

/** Icône par nom, avec repli sûr (évite un crash si un nom est absent du lexique). */
export default function Icon({ name, size = 18, strokeWidth = 2, className = '', ...rest }) {
  const Component = MAP[name] || CircleDot
  return <Component size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" focusable="false" {...rest} />
}

export { MAP as ICONS }
