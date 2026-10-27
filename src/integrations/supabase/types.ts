export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      claude_feed_tokens: {
        Row: {
          created_at: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          token?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      course_photo_folders: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_photo_folders_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      course_photos: {
        Row: {
          course_id: string;
          created_at: string;
          folder_name: string | null;
          id: string;
          path: string;
          tutorial_no: number | null;
          user_id: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          folder_name?: string | null;
          id?: string;
          path: string;
          tutorial_no?: number | null;
          user_id?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          folder_name?: string | null;
          id?: string;
          path?: string;
          tutorial_no?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_photos_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          code: string | null;
          color: string | null;
          created_at: string | null;
          id: string;
          name: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          code?: string | null;
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Update: {
          code?: string | null;
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      course_grade_items: {
        Row: {
          best_count: number | null;
          course_id: string;
          created_at: string;
          expected_count: number | null;
          id: string;
          is_final: boolean;
          marks: Json;
          max_score: number;
          score: number | null;
          title: string;
          updated_at: string;
          user_id: string;
          weight: number;
        };
        Insert: {
          best_count?: number | null;
          course_id: string;
          created_at?: string;
          expected_count?: number | null;
          id?: string;
          is_final?: boolean;
          marks?: Json;
          max_score?: number;
          score?: number | null;
          title: string;
          updated_at?: string;
          user_id?: string;
          weight: number;
        };
        Update: {
          best_count?: number | null;
          course_id?: string;
          created_at?: string;
          expected_count?: number | null;
          id?: string;
          is_final?: boolean;
          marks?: Json;
          max_score?: number;
          score?: number | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "course_grade_items_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      course_grade_settings: {
        Row: {
          course_id: string;
          credit_hours: number;
          grade_cutoffs: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          course_id: string;
          credit_hours?: number;
          grade_cutoffs?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          course_id?: string;
          credit_hours?: number;
          grade_cutoffs?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_grade_settings_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: true;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_inbox_tokens: {
        Row: {
          created_at: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          token?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      grade_feeds: {
        Row: {
          created_at: string
          enabled: boolean
          encrypted_url: string
          host: string
          id: string
          last_checked_at: string | null
          last_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          encrypted_url: string
          host: string
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          encrypted_url?: string
          host?: string
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      unsorted_grades: {
        Row: { course_id: string; created_at: string; id: string; max_score: number; score: number; title: string; user_id: string }
        Insert: { course_id: string; created_at?: string; id?: string; max_score: number; score: number; title: string; user_id: string }
        Update: { course_id?: string; created_at?: string; id?: string; max_score?: number; score?: number; title?: string; user_id?: string }
        Relationships: []
      }
      grade_webhooks: {
        Row: { created_at: string; last_result: string | null; last_seen_at: string | null; token_hash: string; user_id: string }
        Insert: { created_at?: string; last_result?: string | null; last_seen_at?: string | null; token_hash: string; user_id: string }
        Update: { created_at?: string; last_result?: string | null; last_seen_at?: string | null; token_hash?: string; user_id?: string }
        Relationships: []
      }
      grade_connect_states: {
        Row: { created_at: string; expires_at: string; state_hash: string; user_id: string }
        Insert: { created_at?: string; expires_at: string; state_hash: string; user_id: string }
        Update: { created_at?: string; expires_at?: string; state_hash?: string; user_id?: string }
        Relationships: []
      }
      grade_push_subscriptions: {
        Row: { created_at: string; endpoint: string; id: string; user_id: string }
        Insert: { created_at?: string; endpoint: string; id?: string; user_id: string }
        Update: { created_at?: string; endpoint?: string; id?: string; user_id?: string }
        Relationships: []
      }
      grade_notifications: {
        Row: {
          course_code: string | null;
          course_id: string;
          course_name: string;
          grade_item_id: string | null;
          grade_title: string;
          id: string;
          max_score: number;
          read_at: string | null;
          received_at: string;
          score: number;
          user_id: string;
        };
        Insert: {
          course_code?: string | null;
          course_id: string;
          course_name: string;
          grade_item_id?: string | null;
          grade_title: string;
          id?: string;
          max_score: number;
          read_at?: string | null;
          received_at?: string;
          score: number;
          user_id?: string;
        };
        Update: {
          course_code?: string | null;
          course_id?: string;
          course_name?: string;
          grade_item_id?: string | null;
          grade_title?: string;
          id?: string;
          max_score?: number;
          read_at?: string | null;
          received_at?: string;
          score?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_notifications_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_notifications_grade_item_id_fkey";
            columns: ["grade_item_id"];
            isOneToOne: false;
            referencedRelation: "course_grade_items";
            referencedColumns: ["id"];
          },
        ];
      };
      deadlines: {
        Row: {
          completed: boolean;
          course_id: string;
          created_at: string;
          due_date: string;
          id: string;
          kind: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          course_id: string;
          created_at?: string;
          due_date: string;
          id?: string;
          kind?: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed?: boolean;
          course_id?: string;
          created_at?: string;
          due_date?: string;
          id?: string;
          kind?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deadlines_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_completions: {
        Row: {
          completed_date: string;
          created_at: string | null;
          habit_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          completed_date: string;
          created_at?: string | null;
          habit_id: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          completed_date?: string;
          created_at?: string | null;
          habit_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_completions_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habits: {
        Row: {
          archived: boolean | null;
          category: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          archived?: boolean | null;
          category?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Update: {
          archived?: boolean | null;
          category?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      lectures: {
        Row: {
          completed: boolean | null;
          course_id: string;
          created_at: string | null;
          id: string;
          kind: string;
          lecture_date: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          completed?: boolean | null;
          course_id: string;
          created_at?: string | null;
          id?: string;
          kind?: string;
          lecture_date?: string | null;
          title: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Update: {
          completed?: boolean | null;
          course_id?: string;
          created_at?: string | null;
          id?: string;
          kind?: string;
          lecture_date?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lectures_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_redemptions: {
        Row: {
          cost: number;
          created_at: string;
          id: string;
          title: string;
          user_id: string;
        };
        Insert: {
          cost: number;
          created_at?: string;
          id?: string;
          title: string;
          user_id?: string;
        };
        Update: {
          cost?: number;
          created_at?: string;
          id?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rewards: {
        Row: {
          cost: number;
          created_at: string;
          id: string;
          title: string;
          user_id: string;
        };
        Insert: {
          cost: number;
          created_at?: string;
          id?: string;
          title: string;
          user_id?: string;
        };
        Update: {
          cost?: number;
          created_at?: string;
          id?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          agent_name: string;
          habit_page_name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_name?: string;
          habit_page_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          agent_name?: string;
          habit_page_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_grade_inbox_check: {
        Args: { p_user_id: string };
        Returns: {
          allowed: boolean;
          checks_used: number;
          reset_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
