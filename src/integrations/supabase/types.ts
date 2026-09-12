export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      commercials: {
        Row: {
          active: boolean
          audio_url: string | null
          created_at: string
          duration_seconds: number
          id: string
          schedule_times: string[]
          show_video: boolean
          title: string
          updated_at: string
          youtube_id: string | null
        }
        Insert: {
          active?: boolean
          audio_url?: string | null
          created_at?: string
          duration_seconds: number
          id?: string
          schedule_times?: string[]
          show_video?: boolean
          title: string
          updated_at?: string
          youtube_id?: string | null
        }
        Update: {
          active?: boolean
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          schedule_times?: string[]
          show_video?: boolean
          title?: string
          updated_at?: string
          youtube_id?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          created_at: string
          id: string
          sent_count: number
          slot_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          sent_count?: number
          slot_key: string
        }
        Update: {
          created_at?: string
          id?: string
          sent_count?: number
          slot_key?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      song_ratings: {
        Row: {
          created_at: string
          device_id: string
          id: string
          rating: number
          song_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          rating: number
          song_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          rating?: number
          song_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_ratings_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_requests: {
        Row: {
          artist: string | null
          created_at: string
          id: string
          requester: string | null
          title: string
        }
        Insert: {
          artist?: string | null
          created_at?: string
          id?: string
          requester?: string | null
          title: string
        }
        Update: {
          artist?: string | null
          created_at?: string
          id?: string
          requester?: string | null
          title?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          artist: string | null
          audio_url: string | null
          created_at: string
          duration_seconds: number
          id: string
          position: number
          show_video: boolean
          station_id: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        Insert: {
          artist?: string | null
          audio_url?: string | null
          created_at?: string
          duration_seconds: number
          id?: string
          position?: number
          show_video?: boolean
          station_id: string
          title: string
          updated_at?: string
          youtube_id?: string | null
        }
        Update: {
          artist?: string | null
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          position?: number
          show_video?: boolean
          station_id?: string
          title?: string
          updated_at?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "songs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          nickname: string
          station_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          nickname: string
          station_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          nickname?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_messages_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_requests: {
        Row: {
          created_at: string
          genre: string | null
          id: string
          name: string
          note: string | null
          number: number | null
          requester: string | null
          songs: string | null
        }
        Insert: {
          created_at?: string
          genre?: string | null
          id?: string
          name: string
          note?: string | null
          number?: number | null
          requester?: string | null
          songs?: string | null
        }
        Update: {
          created_at?: string
          genre?: string | null
          id?: string
          name?: string
          note?: string | null
          number?: number | null
          requester?: string | null
          songs?: string | null
        }
        Relationships: []
      }
      station_sessions: {
        Row: {
          id: string
          last_seen: string
          station_id: string
        }
        Insert: {
          id?: string
          last_seen?: string
          station_id: string
        }
        Update: {
          id?: string
          last_seen?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          avg_listeners: number
          color: string
          created_at: string
          fluctuation: number
          fluctuation_rate_seconds: number
          id: string
          name: string
          number: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          avg_listeners?: number
          color?: string
          created_at?: string
          fluctuation?: number
          fluctuation_rate_seconds?: number
          id?: string
          name: string
          number: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          avg_listeners?: number
          color?: string
          created_at?: string
          fluctuation?: number
          fluctuation_rate_seconds?: number
          id?: string
          name?: string
          number?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
